import baseline from '../src/data/site-content.json' with { type: 'json' };
import manifest from '../src/data/site-manifest.json' with { type: 'json' };
import policies from '../src/data/legal-drafts.json' with { type: 'json' };
import { validateForPage, mergeContentPage } from '../src/cms/schema.mjs';

const key = path => path === '/' ? '/' : path.replace(/\/$/, '');
const editable = ['path','title','h1','description','eyebrow','intro','sections','faqs','related_links','final_cta','media','order','author','reviewer','category','section_order'];
function publicationPage(row, source) {
  const saved = JSON.parse(row.content_json);
  const input = Object.fromEntries(editable.filter(field => Object.hasOwn(saved, field)).map(field => [field, saved[field]]));
  if (input.sections) input.sections = input.sections.map(section => Object.fromEntries(Object.entries(section).filter(([field]) => ['id','heading','paragraphs','bullets','cards','table','cta'].includes(field))));
  const patch = validateForPage(input, source);
  if (!patch || saved.id !== source.id || patch.path !== row.path) throw new Error('Invalid published link target');
  return mergeContentPage(source, patch);
}
function anchors(page) {
  const ids = ['main-content'];
  // About uses a bespoke composition whose visible work section has this
  // public anchor in addition to the source section identifiers.
  if (page.id === 'about') ids.push('how-we-work');
  // The RFQ uses its own form, not the generic content sections.
  if (page.id !== 'rfq') ids.push(...page.sections.flatMap(section => [section.id, ...(section.cards || []).map(card => card.anchor).filter(Boolean)]));
  if (page.faqs?.length && !['home', 'rfq', 'faq'].includes(page.id)) ids.push('questions');
  return ids.length === new Set(ids).size ? new Set(ids) : null;
}
function links(page) {
  return [...(page.related_links || []).map(link => link.href), page.final_cta?.href, ...page.sections.flatMap(section => [section.cta?.href, ...(section.cards || []).map(card => card.href)])].filter(Boolean);
}

/** Drafts may contain unfinished links. Publishing must resolve every edited-page link. */
export async function checkPublicationLinks(env, candidate) {
  const [rows, aliases] = await Promise.all([
    env.DB.prepare('SELECT page_id,path,state,content_json,revision FROM content_publications').all(),
    env.DB.prepare('SELECT path,page_id FROM content_aliases').all(),
  ]);
  const fingerprint = [...rows.results].sort((a, b) => a.page_id < b.page_id ? -1 : a.page_id > b.page_id ? 1 : 0).map(row => `${row.page_id}:${row.revision}:${row.state}`).join('|');
  const registry = new Map(), byId = new Map(), withdrawn = new Set(), fallbacks = new Map();
  for (const source of baseline) {
    const row = rows.results.find(row => row.page_id === source.id);
    if (source.id !== candidate.id && row?.state === 'withdrawn') {
      withdrawn.add(key(source.path)); withdrawn.add(key(row.path));
      for (const alias of aliases.results.filter(alias => alias.page_id === source.id)) withdrawn.add(key(alias.path));
      continue;
    }
    if (source.id !== candidate.id && source.phase !== 'P0' && !row) continue;
    const page = source.id === candidate.id ? candidate : row ? publicationPage(row, source) : source;
    const target = { path: page.path, anchors: anchors(page) };
    if (!target.anchors) return { valid: false, fingerprint };
    byId.set(source.id, target); registry.set(key(source.path), target); registry.set(key(page.path), target);
  }
  for (const alias of aliases.results) if (byId.has(alias.page_id)) registry.set(key(alias.path), byId.get(alias.page_id));
  for (const route of manifest.routes.filter(route => route.include_in_p0_plan && ['legal','system'].includes(route.kind) && route.id !== '404')) {
    const policy = policies.find(policy => policy.path === route.path);
    const ids = ['main-content', ...Array.from(policy?.markdown.matchAll(/^## /gm) || [], (_, index) => 'legal-' + (index + 1))];
    registry.set(key(route.path), { path: route.path, anchors: new Set(ids) });
  }
  for (const [from, to] of Object.entries(manifest.p0_link_fallbacks)) if (!registry.has(key(from)) && !withdrawn.has(key(from))) fallbacks.set(key(from), to);
  const legalAliases = { '/privacy-policy':'/privacy', '/terms-of-use':'/terms', '/cookie-policy':'/cookies', '/confidentiality':'/project-information' };
  for (const [from, to] of Object.entries(legalAliases)) if (registry.has(to)) registry.set(from, registry.get(to));
  function exists(href, seen = new Set()) {
    const [path, hash] = href.split('#'), normalized = key(path);
    if (withdrawn.has(normalized) || seen.has(normalized)) return false;
    const target = registry.get(normalized);
    if (target) return !hash || target.anchors.has(hash);
    const fallback = fallbacks.get(normalized);
    if (!fallback) return false;
    seen.add(normalized);
    // Prepared-route redirects provide their own overview anchor.
    return exists(fallback, seen);
  }
  return { valid: links(candidate).every(href => exists(href)), fingerprint };
}

export async function validPublicationLinks(env, candidate) { return (await checkPublicationLinks(env, candidate)).valid; }
