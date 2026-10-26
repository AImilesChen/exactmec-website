import { hmac } from './domain.mjs';
import { exactKeys, mergeContentPage, plain } from '../src/cms/schema.mjs';
import baseline from '../src/data/site-content.json' with { type: 'json' };
import { checkPublicationLinks } from './content-links.mjs';

const stmt = (db, sql, ...values) => db.prepare(sql).bind(...values);
const error = (code, status = 422) => ({ error: code, status });
const publicationFingerprint = "SELECT COALESCE(group_concat(page_id||':'||revision||':'||state,'|'),'') FROM (SELECT page_id,revision,state FROM content_publications ORDER BY page_id)";
export const defaultPublicSettings = Object.freeze({ contactEmail: 'sales@exactmec.com', whatsappNumber: '8615990661727', address: '中国浙江台州路桥金清大道46号' });
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex,nofollow' } });
async function auditStatement(env, actor, pageId, action, revision, time) {
  const [actorHash, pageHash] = await Promise.all([hmac(env.CONTACT_HASH_SECRET, `actor:${actor.id}`), hmac(env.CONTACT_HASH_SECRET, `content:${pageId}`)]);
  return { sql: 'INSERT INTO content_publication_audit(id,actor_hash,page_hash,action,revision,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM content_publications WHERE page_id=? AND mutation_id=?)', values: [crypto.randomUUID(), actorHash, pageHash, action, revision, time] };
}
export async function contentPublicationDetail(env, pageId) {
  const row = await stmt(env.DB, 'SELECT state,path,revision,draft_revision,published_at,updated_at FROM content_publications WHERE page_id=?', pageId).first();
  return row ? { state: row.state, path: row.path, revision: row.revision, draftRevision: row.draft_revision, publishedAt: row.published_at, updatedAt: row.updated_at } : { state: 'source', revision: 0 };
}
function validConfirmation(input, data) {
  return exactKeys(input, ['revision', 'sourceHash', 'publicationRevision']) && Number.isSafeInteger(input.revision) && input.revision >= 1 && input.revision === data.revision && input.sourceHash === data.sourceHash && !data.stale && Number.isSafeInteger(input.publicationRevision) && input.publicationRevision >= 0;
}
export async function publishContent(env, actor, page, data, input) {
  if (!validConfirmation(input, data)) return error('revision_conflict', 409);
  if (!data.draft) return error('invalid_patch');
  const merged = mergeContentPage(page, data.draft);
  const linkCheck = await checkPublicationLinks(env, merged);
  if (!linkCheck.valid) return error('invalid_links');
  const collision = await stmt(env.DB, 'SELECT page_id FROM content_publications WHERE path=? AND page_id<>? UNION SELECT page_id FROM content_aliases WHERE path=? AND page_id<>?', merged.path, page.id, merged.path, page.id).first();
  if (collision || baseline.some(other => other.id !== page.id && other.path === merged.path)) return error('path_conflict', 409);
  const timestamp = new Date().toISOString(), mutation = crypto.randomUUID();
  const next = input.publicationRevision + 1;
  const audit = await auditStatement(env, actor, page.id, 'published', next, timestamp);
  try {
    const result = await env.DB.batch([
      stmt(env.DB, `INSERT INTO content_publications(page_id,original_path,path,source_hash,content_json,draft_revision,revision,state,mutation_id,published_at,updated_at)
        SELECT ?,?,?,?,?,?,1,'published',?,?,? FROM content_drafts WHERE page_id=? AND revision=? AND source_hash=? AND ?=0 AND (${publicationFingerprint})=? ON CONFLICT(page_id) DO NOTHING RETURNING revision`, page.id, page.path, merged.path, data.sourceHash, JSON.stringify(merged), data.revision, mutation, timestamp, timestamp, page.id, data.revision, data.sourceHash, input.publicationRevision, linkCheck.fingerprint),
      stmt(env.DB, `INSERT INTO content_aliases(path,page_id) SELECT path,page_id FROM content_publications WHERE page_id=? AND revision=? AND ?>0 AND EXISTS(SELECT 1 FROM content_drafts WHERE page_id=? AND revision=? AND source_hash=?) AND (${publicationFingerprint})=? ON CONFLICT(path) DO NOTHING`, page.id, input.publicationRevision, input.publicationRevision, page.id, data.revision, data.sourceHash, linkCheck.fingerprint),
      stmt(env.DB, `UPDATE content_publications SET path=?,source_hash=?,content_json=?,draft_revision=?,revision=revision+1,state='published',mutation_id=?,published_at=?,updated_at=? WHERE page_id=? AND revision=? AND ?>0 AND EXISTS(SELECT 1 FROM content_drafts WHERE page_id=? AND revision=? AND source_hash=?) AND (${publicationFingerprint})=? RETURNING revision`, merged.path, data.sourceHash, JSON.stringify(merged), data.revision, mutation, timestamp, timestamp, page.id, input.publicationRevision, input.publicationRevision, page.id, data.revision, data.sourceHash, linkCheck.fingerprint),
      stmt(env.DB, audit.sql, ...audit.values, page.id, mutation),
    ]);
    if (!result[0].results?.length && !result[2].results?.length) return error('revision_conflict', 409);
    return { published: true };
  } catch (cause) {
    if (/UNIQUE constraint failed/.test(String(cause))) return error('path_conflict', 409);
    throw cause;
  }
}
export async function withdrawContent(env, actor, page, data, input) {
  if (!validConfirmation(input, data) || input.publicationRevision < 1) return error('revision_conflict', 409);
  if (['home', 'rfq'].includes(page.id)) return error('required_page', 422);
  const timestamp = new Date().toISOString(), mutation = crypto.randomUUID();
  const audit = await auditStatement(env, actor, page.id, 'withdrawn', input.publicationRevision + 1, timestamp);
  const result = await env.DB.batch([
    stmt(env.DB, `UPDATE content_publications SET state='withdrawn',revision=revision+1,mutation_id=?,updated_at=? WHERE page_id=? AND revision=? AND state='published' AND EXISTS(SELECT 1 FROM content_drafts WHERE page_id=? AND revision=? AND source_hash=?) RETURNING revision`, mutation, timestamp, page.id, input.publicationRevision, page.id, data.revision, data.sourceHash),
    stmt(env.DB, audit.sql, ...audit.values, page.id, mutation),
  ]);
  return result[0].results?.length ? { withdrawn: true } : error('revision_conflict', 409);
}
export function validatePublicSettings(input, env = {}) {
  if (!exactKeys(input, ['contactEmail', 'whatsappNumber', 'address']) || !plain(input.address, 500) || typeof input.whatsappNumber !== 'string' || !/^\+?[1-9]\d{6,14}$/.test(input.whatsappNumber) || typeof input.contactEmail !== 'string') return null;
  const approved = String(env.APPROVED_PUBLIC_EMAILS || defaultPublicSettings.contactEmail).split(',').map(email => email.trim().toLowerCase());
  if (!approved.includes(input.contactEmail.toLowerCase()) || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(input.contactEmail)) return null;
  return { contactEmail: input.contactEmail.toLowerCase(), whatsappNumber: input.whatsappNumber.replace(/^\+/, ''), address: input.address.trim() };
}
export async function handleContentSettings(request, env, actor) {
  const load = async () => {
    const row = await stmt(env.DB, 'SELECT settings_json,revision,updated_at FROM content_settings WHERE id=1').first();
    const settings = row ? validatePublicSettings(JSON.parse(row.settings_json), env) : defaultPublicSettings;
    if (!settings) throw new Error('Invalid public settings');
    return { settings, revision: row?.revision ?? 0, updatedAt: row?.updated_at ?? null };
  };
  if (request.method === 'GET') return response(await load());
  if (request.method !== 'PATCH') return response({ error: 'method_not_allowed' }, 405);
  let input;
  try { const raw = await request.text(); if (new TextEncoder().encode(raw).length > 4096) throw new Error(); input = JSON.parse(raw); } catch { return response({ error: 'invalid_request' }, 400); }
  const settings = validatePublicSettings(input?.settings, env);
  if (!exactKeys(input, ['revision', 'settings']) || !Number.isSafeInteger(input.revision) || input.revision < 0 || !settings) return response({ error: 'invalid_patch' }, 422);
  const mutation = crypto.randomUUID(), time = new Date().toISOString();
  const [actorHash, pageHash] = await Promise.all([hmac(env.CONTACT_HASH_SECRET, `actor:${actor.id}`), hmac(env.CONTACT_HASH_SECRET, 'content:public-settings')]);
  const results = await env.DB.batch([
    stmt(env.DB, `INSERT INTO content_settings(id,settings_json,revision,mutation_id,updated_at) SELECT 1,?,1,?,? WHERE ?=0 ON CONFLICT(id) DO NOTHING RETURNING revision`, JSON.stringify(settings), mutation, time, input.revision),
    stmt(env.DB, `UPDATE content_settings SET settings_json=?,revision=revision+1,mutation_id=?,updated_at=? WHERE id=1 AND revision=? AND ?>0 RETURNING revision`, JSON.stringify(settings), mutation, time, input.revision, input.revision),
    stmt(env.DB, `INSERT INTO content_publication_audit(id,actor_hash,page_hash,action,revision,created_at) SELECT ?,?,?,'settings_updated',revision,? FROM content_settings WHERE id=1 AND mutation_id=?`, crypto.randomUUID(), actorHash, pageHash, time, mutation),
  ]);
  return results[0].results?.length || results[1].results?.length ? response(await load()) : response({ error: 'revision_conflict' }, 409);
}
