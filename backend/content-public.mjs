import baseline from '../src/data/site-content.json' with { type: 'json' };
import { validateForPage, mergeContentPage } from '../src/cms/schema.mjs';
import { validatePublicSettings } from './content-publication.mjs';

const enabled = value => value === true || value === 'true';
export const emptyPublicContent = () => ({ pages: [], withdrawn: [], routes: {}, settings: {} });
const editable = ['path', 'title', 'h1', 'description', 'eyebrow', 'intro', 'sections', 'faqs', 'related_links', 'final_cta', 'media', 'order', 'author', 'reviewer', 'category', 'section_order'];

/** This reader never touches content_drafts, Lead records or credentials. */
export async function loadPublicContent(env = {}) {
  if (!enabled(env.CMS_ENABLED)) return emptyPublicContent();
  if (!env.DB) throw new Error('Published content unavailable');
  const [rows, aliases, settingsRow] = await Promise.all([
    env.DB.prepare('SELECT page_id,original_path,path,source_hash,content_json,revision,state,published_at,updated_at FROM content_publications').all(),
    env.DB.prepare('SELECT path,page_id FROM content_aliases').all(),
    env.DB.prepare('SELECT settings_json FROM content_settings WHERE id=1').first(),
  ]);
  const bundle = emptyPublicContent();
  for (const row of rows.results) {
    const source = baseline.find(page => page.id === row.page_id);
    if (!source || source.path !== row.original_path) throw new Error('Invalid published content');
    const snapshot = JSON.parse(row.content_json);
    const input = Object.fromEntries(editable.filter(key => Object.hasOwn(snapshot, key)).map(key => [key, snapshot[key]]));
    if (input.sections) input.sections = input.sections.map(section => Object.fromEntries(Object.entries(section).filter(([key]) => ['id','heading','paragraphs','bullets','cards','table','cta'].includes(key))));
    const patch = validateForPage(input, source);
    if (!patch || snapshot.id !== source.id || patch.path !== row.path) throw new Error('Invalid published content');
    const page = mergeContentPage(source, patch);
    if (row.state === 'published') {
      page.publishedAt = row.published_at; page.updatedAt = row.updated_at; page.publicationRevision = row.revision;
      bundle.pages.push(page); bundle.routes[source.path] = row.path;
      for (const alias of aliases.results.filter(alias => alias.page_id === source.id)) bundle.routes[alias.path] = row.path;
    } else if (row.state === 'withdrawn') {
      bundle.withdrawn.push(source.path, row.path, ...aliases.results.filter(alias => alias.page_id === source.id).map(alias => alias.path));
    } else throw new Error('Invalid publication state');
  }
  if (settingsRow) {
    const settings = validatePublicSettings(JSON.parse(settingsRow.settings_json), env);
    if (!settings) throw new Error('Invalid public settings');
    bundle.settings = settings;
  }
  bundle.pages.sort((a, b) => (a.order ?? baseline.findIndex(page => page.id === a.id)) - (b.order ?? baseline.findIndex(page => page.id === b.id)));
  return bundle;
}

export function resolvePublishedContent(input, bundle = emptyPublicContent()) {
  if (typeof input !== 'string') return null;
  const path = input === '/' ? '/' : input.replace(/\/$/, '') + '/';
  if ((bundle.withdrawn || []).includes(path)) return { status: 410, originalPath: path, page: null, redirect: null };
  const target = bundle.routes?.[path];
  const page = bundle.pages?.find(page => page.path === (target || path));
  if (!page) return null;
  const originalPath = baseline.find(source => source.id === page.id)?.path || page.path;
  return { status: target && target !== path || input !== path ? 308 : 200, originalPath, page, redirect: target && target !== path || input !== path ? page.path : null };
}

export function publishedSitemapPages(bundle) {
  return baseline.filter(page => page.phase === 'P0' && !(bundle.withdrawn || []).includes(page.path))
    .map(page => bundle.pages.find(published => published.id === page.id) || page)
    .concat(bundle.pages.filter(page => page.phase !== 'P0'))
    .map(page => ({ path: page.path, ...(page.updatedAt ? { lastmod: page.updatedAt.slice(0, 10) } : {}) }));
}
