import baseline from '../src/data/site-content.json' with { type: 'json' };
import { hmac } from './domain.mjs';
import { validateForPage, mergeContentPage, mediaLibrary } from '../src/cms/schema.mjs';
import { contentPublicationDetail, publishContent, withdrawContent, handleContentSettings } from './content-publication.mjs';
import { loadPublicContent } from './content-public.mjs';

// Drafts remain private. Only an explicit version-confirmed publication is read publicly.
const pages = new Map(baseline.map(page => [page.id, page]));
const hashes = new Map();
const responseHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' };
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { ...responseHeaders, ...extra } });
const fail = (error, status) => json({ error }, status);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
const sourceHashValid = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const stmt = (db, sql, ...values) => db.prepare(sql).bind(...values);
const uuid = () => crypto.randomUUID();

function validatePatch(patch, page, stale = false) {
  return validateForPage(patch, page, stale);
}

function mergedPage(page, patch) {
  return mergeContentPage(page, patch);
}

async function currentHash(page) {
  if (!hashes.has(page.id)) hashes.set(page.id, crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(page))).then(buffer => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('')));
  return hashes.get(page.id);
}

async function auditHashes(env, actor, pageId) {
  return Promise.all([hmac(env.CONTACT_HASH_SECRET, `actor:${actor.id}`), hmac(env.CONTACT_HASH_SECRET, `content:${pageId}`)]);
}

async function audit(env, actor, pageId, action, revision) {
  const [actorHash, pageHash] = await auditHashes(env, actor, pageId);
  await stmt(env.DB, 'INSERT INTO content_audit(id,actor_hash,page_hash,action,revision,created_at) VALUES(?,?,?,?,?,?)', uuid(), actorHash, pageHash, action, revision, new Date().toISOString()).run();
}

async function readBody(request) {
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 65536) return null;
    const input = JSON.parse(raw);
    return object(input) ? input : null;
  } catch { return null; }
}

async function storedDraft(env, pageId) {
  return stmt(env.DB, 'SELECT page_id,source_hash,patch_json,revision,updated_at FROM content_drafts WHERE page_id=?', pageId).first();
}

async function detail(env, page, row) {
  const sourceHash = await currentHash(page);
  // Revalidate persisted data before it crosses the API/export boundary.
  const stale = !!row && row.source_hash !== sourceHash;
  const draft = row ? validatePatch(JSON.parse(row.patch_json), page, stale) : null;
  if (row && draft === null) throw new Error('Stored content patch invalid');
  return { page: structuredClone(page), draft, revision: row?.revision ?? 0, sourceHash, stale, publication: await contentPublicationDetail(env, page.id), mediaLibrary };
}

async function saveDraft(request, env, actor, page) {
  const input = await readBody(request);
  if (!input) return fail('invalid_request', 400);
  if (!exactKeys(input, ['revision', 'sourceHash', 'patch']) || !Number.isSafeInteger(input.revision) || input.revision < 0 || !sourceHashValid(input.sourceHash)) return fail('invalid_patch', 422);
  if (input.sourceHash !== await currentHash(page)) return fail('source_conflict', 409);
  const patch = validatePatch(input.patch, page);
  if (patch === null) return fail('invalid_patch', 422);
  const timestamp = new Date().toISOString();
  const mutation = uuid();
  const [actorHash, pageHash] = await auditHashes(env, actor, page.id);
  const result = await env.DB.batch([
    stmt(env.DB, 'INSERT INTO content_drafts(page_id,source_hash,patch_json,revision,mutation_id,updated_at) SELECT ?,?,?,1,?,? WHERE ?=0 ON CONFLICT(page_id) DO NOTHING RETURNING revision', page.id, input.sourceHash, JSON.stringify(patch), mutation, timestamp, input.revision),
    stmt(env.DB, 'UPDATE content_drafts SET source_hash=?,patch_json=?,revision=revision+1,mutation_id=?,updated_at=? WHERE page_id=? AND revision=? AND ?>0 RETURNING revision', input.sourceHash, JSON.stringify(patch), mutation, timestamp, page.id, input.revision, input.revision),
    stmt(env.DB, 'INSERT INTO content_audit(id,actor_hash,page_hash,action,revision,created_at) SELECT ?,?,?,\'saved\',revision,? FROM content_drafts WHERE page_id=? AND mutation_id=?', uuid(), actorHash, pageHash, timestamp, page.id, mutation)
  ]);
  if (!result[0].results?.length && !result[1].results?.length) return fail('revision_conflict', 409);
  return json(await detail(env, page, await storedDraft(env, page.id)));
}

async function exportDraft(request, env, actor, page) {
  const input = await readBody(request);
  if (!input) return fail('invalid_request', 400);
  if (!exactKeys(input, ['sourceHash']) || !sourceHashValid(input.sourceHash)) return fail('invalid_patch', 422);
  const data = await detail(env, page, await storedDraft(env, page.id));
  if (data.stale || input.sourceHash !== data.sourceHash) return fail('source_conflict', 409);
  await audit(env, actor, page.id, 'exported', data.revision);
  return new Response(`${JSON.stringify(mergedPage(page, data.draft ?? {}), null, 2)}\n`, { headers: { ...responseHeaders, 'Content-Disposition': `attachment; filename="${page.id}.json"` } });
}

// Call only after Access authentication. This is a read-only saved-draft preview.
export async function loadContentPreview(env, pageId) {
  const page = pages.get(pageId);
  if (!page || !env.DB) return null;
  const data = await detail(env, page, await storedDraft(env, pageId));
  if (data.stale) return null;
  const merged = mergedPage(page, data.draft ?? {});
  const bundle = await loadPublicContent(env);
  bundle.pages = [...bundle.pages.filter(item => item.id !== page.id), merged];
  bundle.routes[page.path] = merged.path;
  bundle.withdrawn = bundle.withdrawn.filter(path => path !== page.path && path !== merged.path);
  bundle.preview = true;
  return { page: merged, originalPath: page.path, bundle };
}

export async function handleContent(request, env, { actor } = {}) {
  const path = new URL(request.url).pathname;
  if (path !== '/api/admin/content' && !path.startsWith('/api/admin/content/') && path !== '/api/admin/content-settings') return null;
  if (!actor || typeof actor.id !== 'string' || !actor.id) return fail('unauthorized', 401);
  if (!env.DB || typeof env.CONTACT_HASH_SECRET !== 'string' || env.CONTACT_HASH_SECRET.length < 32) return fail('service_unavailable', 503);
  try {
    if (path === '/api/admin/content-settings') return handleContentSettings(request, env, actor);
    if (path === '/api/admin/content') {
      if (request.method !== 'GET') return fail('method_not_allowed', 405);
      const rows = await stmt(env.DB, 'SELECT page_id,updated_at FROM content_drafts').all();
      const drafts = new Map(rows.results.map(row => [row.page_id, row.updated_at]));
      const publications = await stmt(env.DB, 'SELECT page_id,path,state,revision,published_at FROM content_publications').all();
      const publicationMap = new Map(publications.results.map(row => [row.page_id, row]));
      return json({ items: baseline.map(({ id, path: pagePath, h1, title, phase }) => ({ id, path: pagePath, h1, title, phase, ...(publicationMap.has(id) ? { publication: publicationMap.get(id) } : {}), ...(drafts.has(id) ? { draftUpdatedAt: drafts.get(id) } : {}) })) });
    }
    const match = /^\/api\/admin\/content\/([a-z0-9]+(?:-[a-z0-9]+)*)(\/(?:export|preview|publish|withdraw))?$/.exec(path);
    const page = match ? pages.get(match[1]) : null;
    if (!page) return fail('not_found', 404);
    if (match[2]) {
      if (request.method !== 'POST') return fail('method_not_allowed', 405);
      if (match[2] === '/export') return await exportDraft(request, env, actor, page);
      const input = await readBody(request);
      const data = await detail(env, page, await storedDraft(env, page.id));
      if (match[2] === '/preview') {
        if (!input || !exactKeys(input, ['sourceHash', 'revision']) || input.sourceHash !== data.sourceHash || input.revision !== data.revision || data.stale) return fail('source_conflict', 409);
        return json({ page: mergedPage(page, data.draft ?? {}), publication: data.publication, preview: true });
      }
      const result = match[2] === '/publish' ? await publishContent(env, actor, page, data, input) : await withdrawContent(env, actor, page, data, input);
      if (result.error) return fail(result.error, result.status);
      return json(await detail(env, page, await storedDraft(env, page.id)));
    }
    if (request.method === 'PATCH') return await saveDraft(request, env, actor, page);
    if (request.method !== 'GET') return fail('method_not_allowed', 405);
    const data = await detail(env, page, await storedDraft(env, page.id));
    await audit(env, actor, page.id, 'viewed', data.revision);
    return json(data);
  } catch {
    return fail('service_unavailable', 503);
  }
}
