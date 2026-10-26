import assets from '../data/v3-assets.json' with { type: 'json' };
import manifest from '../data/site-manifest.json' with { type: 'json' };

const existingIllustrations = ['lighting-studio-v2','motor-studio-v2','electronics-studio-v3','automotive-studio-v3','motorcycle-studio-v3','energy-studio-v3','industrial-studio-v3','tools-studio-v3','mold-studio-v2'];
export const mediaLibrary = Object.freeze([...assets.map(asset => ({ id: asset.id, path: asset.path, kind: 'generated', rights: asset.rights })), ...existingIllustrations.filter(id => !assets.some(asset => asset.id === id)).map(id => ({ id, path: '/assets/' + id + '.webp', kind: 'generated', rights: 'Existing generated illustrative asset; not evidence of factory ownership or delivered work' }))].map(asset => Object.freeze(asset)));
const mediaPaths = new Set(mediaLibrary.map(asset => asset.path));
export const isContentId = value => typeof value === 'string' && value.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export const isSourceHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const exactKeys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
export const plain = (value, max, multiline = false) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[<>\u007f-\u009f]/.test(value) && !(multiline ? /[\u0000-\u0009\u000b-\u001f]/ : /[\u0000-\u001f]/).test(value);
export const contentPath = value => typeof value === 'string' && value.length <= 180 && (value === '/' || /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/){1,3}$/.test(value)) && !/^\/(?:api|admin|assets|brand|design-system|privacy-policy|terms-of-use|cookie-policy|confidentiality)(?:\/|$)/.test(value);
export const internalHref = value => typeof value === 'string' && value.length <= 240 && /^\/(?:[a-z0-9/-]*)(?:#[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(value) && !value.includes('//') && !/^\/(?:api|admin|assets|brand|design-system)(?:\/|#|$)/.test(value);
const list = (value, count, max) => Array.isArray(value) && value.length <= count && value.every(entry => plain(entry, max, true));
const action = value => exactKeys(value, ['label', 'href']) && plain(value.label, 240) && internalHref(value.href);

/** One schema is used by the editor, API and public reader. No arbitrary HTML, scripts or URLs. */
export function validateContentPatch(patch) {
  if (!exactKeys(patch, ['path', 'title', 'h1', 'description', 'eyebrow', 'intro', 'sections', 'faqs', 'related_links', 'final_cta', 'media', 'order', 'author', 'reviewer', 'category', 'section_order'])) return null;
  const clean = {};
  for (const [key, max, multiline] of [['title', 160], ['h1', 240], ['description', 500], ['eyebrow', 160], ['intro', 4000, true], ['author', 160], ['reviewer', 160], ['category', 160]]) if (Object.hasOwn(patch, key)) {
    if (['author', 'reviewer', 'category'].includes(key) && patch[key] === '') { clean[key] = ''; continue; }
    if (!plain(patch[key], max, multiline)) return null;
    clean[key] = patch[key].trim();
  }
  if (Object.hasOwn(patch, 'path')) { if (!contentPath(patch.path)) return null; clean.path = patch.path; }
  if (Object.hasOwn(patch, 'order')) { if (!Number.isInteger(patch.order) || patch.order < 0 || patch.order > 10000) return null; clean.order = patch.order; }
  if (Object.hasOwn(patch, 'section_order')) {
    if (!Array.isArray(patch.section_order) || patch.section_order.length > 50 || patch.section_order.some(id => !isContentId(id)) || new Set(patch.section_order).size !== patch.section_order.length) return null;
    clean.section_order = [...patch.section_order];
  }
  if (Object.hasOwn(patch, 'sections')) {
    if (!Array.isArray(patch.sections) || patch.sections.length > 50) return null;
    const seen = new Set(); clean.sections = [];
    for (const section of patch.sections) {
      if (!exactKeys(section, ['id', 'heading', 'paragraphs', 'bullets', 'cards', 'table', 'cta']) || !isContentId(section.id) || seen.has(section.id) || !plain(section.heading, 240)) return null;
      seen.add(section.id); const edit = { id: section.id, heading: section.heading.trim() };
      for (const [key, count, max] of [['paragraphs', 20, 4000], ['bullets', 30, 1000]]) if (Object.hasOwn(section, key)) {
        if (!list(section[key], count, max)) return null;
        edit[key] = section[key].map(value => value.trim());
      }
      if (Object.hasOwn(section, 'cards')) {
        if (!Array.isArray(section.cards) || section.cards.length > 30) return null;
        edit.cards = [];
        for (const card of section.cards) {
          if (!exactKeys(card, ['title', 'text', 'href', 'anchor']) || !plain(card.title, 240) || !plain(card.text, 4000, true) || card.href != null && !internalHref(card.href) || card.anchor != null && !isContentId(card.anchor)) return null;
          edit.cards.push({ title: card.title.trim(), text: card.text.trim(), ...(card.href != null ? { href: card.href } : {}), ...(card.anchor != null ? { anchor: card.anchor } : {}) });
        }
      }
      if (Object.hasOwn(section, 'table')) {
        const table = section.table;
        if (!exactKeys(table, ['columns', 'rows']) || !list(table.columns, 10, 240) || table.columns.length < 1 || !Array.isArray(table.rows) || table.rows.length > 100 || table.rows.some(row => !list(row, 10, 2000) || row.length !== table.columns.length)) return null;
        edit.table = { columns: [...table.columns], rows: table.rows.map(row => [...row]) };
      }
      if (Object.hasOwn(section, 'cta')) { if (!action(section.cta)) return null; edit.cta = { ...section.cta }; }
      clean.sections.push(edit);
    }
  }
  if (Object.hasOwn(patch, 'faqs')) {
    if (!Array.isArray(patch.faqs) || patch.faqs.length > 30) return null;
    clean.faqs = [];
    for (const faq of patch.faqs) {
      if (!exactKeys(faq, ['q', 'a']) || !plain(faq.q, 500) || !plain(faq.a, 4000, true)) return null;
      clean.faqs.push({ q: faq.q.trim(), a: faq.a.trim() });
    }
  }
  if (Object.hasOwn(patch, 'related_links')) {
    if (!Array.isArray(patch.related_links) || patch.related_links.length > 30 || patch.related_links.some(link => !action(link))) return null;
    clean.related_links = patch.related_links.map(link => ({ ...link }));
  }
  if (Object.hasOwn(patch, 'final_cta')) {
    const cta = patch.final_cta;
    if (!exactKeys(cta, ['heading', 'text', 'label', 'href']) || !plain(cta.heading, 240) || !plain(cta.text, 4000, true) || !plain(cta.label, 240) || !internalHref(cta.href)) return null;
    clean.final_cta = { ...cta };
  }
  if (Object.hasOwn(patch, 'media')) {
    if (!Array.isArray(patch.media) || patch.media.length > 30) return null;
    const seen = new Set(); clean.media = [];
    for (const image of patch.media) {
      if (!exactKeys(image, ['original', 'path', 'alt', 'caption', 'source', 'kind']) || !mediaPaths.has(image.original) || !mediaPaths.has(image.path) || seen.has(image.original) || !plain(image.alt, 500) || !plain(image.caption, 500) || !plain(image.source, 1000) || image.kind !== 'generated' || !/illustrat/i.test(image.caption)) return null;
      seen.add(image.original); clean.media.push({ ...image });
    }
  }
  return clean;
}

export function validateForPage(patch, page, stale = false) {
  const clean = validateContentPatch(patch);
  if (!clean) return null;
  if (clean.path && ['home', 'rfq'].includes(page.id) && clean.path !== page.path) return null;
  if (clean.path && manifest.routes.some(route => route.path.replace(/\/$/, '') === clean.path.replace(/\/$/, '') && route.id !== page.id)) return null;
  if (clean.sections && !stale) {
    const ids = new Set(page.sections.map(section => section.id));
    if (clean.sections.some(section => !ids.has(section.id))) return null;
  }
  if (clean.section_order && !stale && (clean.section_order.length !== page.sections.length || clean.section_order.some(id => !page.sections.some(section => section.id === id)))) return null;
  return clean;
}

export function mergeContentPage(page, patch = {}) {
  const result = { ...structuredClone(page), ...structuredClone(patch) };
  if (patch.sections) {
    const original = new Map(page.sections.map(section => [section.id, section]));
    const editIds = new Set(patch.sections.map(section => section.id));
    result.sections = [...patch.sections.map(section => ({ ...structuredClone(original.get(section.id) || {}), ...structuredClone(section) })), ...page.sections.filter(section => !editIds.has(section.id)).map(section => structuredClone(section))];
  }
  if (patch.section_order) result.sections.sort((a, b) => patch.section_order.indexOf(a.id) - patch.section_order.indexOf(b.id));
  return result;
}
