import { validateContentPatch, mergeContentPage, isContentId, isSourceHash } from '../cms/schema.mjs';
export { validateContentPatch, isContentId, isSourceHash };

export function createContentForm(detail) {
  const patch = { ...(detail.draft || {}) };
  if (detail.stale) {
    if (patch.sections) patch.sections = patch.sections.filter(section => detail.page.sections.some(source => source.id === section.id));
    if (patch.section_order && (patch.section_order.length !== detail.page.sections.length || patch.section_order.some(id => !detail.page.sections.some(source => source.id === id)))) delete patch.section_order;
  }
  const page = mergeContentPage(detail.page, patch);
  return {
    path: page.path, title: page.title || '', h1: page.h1 || '', description: page.description || '',
    eyebrow: page.eyebrow || '', intro: page.intro || '', order: page.order ?? '',
    author: page.author || '', reviewer: page.reviewer || '', category: page.category || '',
    sections: (page.sections || []).map(section => ({
      id: section.id, heading: section.heading || '',
      ...(Array.isArray(section.paragraphs) ? { paragraphsText: section.paragraphs.join('\n\n') } : {}),
      ...(Array.isArray(section.bullets) ? { bulletsText: section.bullets.join('\n') } : {}),
      ...(section.cards?.every(card => Object.keys(card).every(key => ['title', 'text', 'href', 'anchor'].includes(key))) ? { cardsText: JSON.stringify(section.cards, null, 2) } : {}),
      ...(section.table ? { tableText: JSON.stringify(section.table, null, 2) } : {}),
      ...(section.cta ? { cta: { ...section.cta } } : {}),
    })),
    faqs: (page.faqs || []).map(item => ({ q: item.q, a: item.a })),
    related: (page.related_links || []).map(link => ({ ...link })),
    final_cta: page.final_cta ? { ...page.final_cta } : null,
    media: (page.media || []).map(image => ({ ...image })),
    ...(page.section_order ? { section_order: [...page.section_order] } : {}),
  };
}

export function buildContentPatch(form) {
  const split = (value, separator) => value.split(separator).map(item => item.trim()).filter(Boolean);
  try {
    return validateContentPatch({
      path: form.path, title: form.title.trim(), h1: form.h1.trim(), description: form.description.trim(),
      ...(form.eyebrow ? { eyebrow: form.eyebrow.trim() } : {}), ...(form.intro ? { intro: form.intro.trim() } : {}),
      ...(form.order !== '' ? { order: Number(form.order) } : {}), author: form.author || '', reviewer: form.reviewer || '', category: form.category || '',
      sections: form.sections.map(section => ({
        id: section.id, heading: section.heading.trim(),
        ...(Object.hasOwn(section, 'paragraphsText') ? { paragraphs: split(section.paragraphsText, /\r?\n\s*\r?\n/) } : {}),
        ...(Object.hasOwn(section, 'bulletsText') ? { bullets: split(section.bulletsText, /\r?\n/) } : {}),
        ...(section.cardsText ? { cards: JSON.parse(section.cardsText) } : {}),
        ...(section.tableText ? { table: JSON.parse(section.tableText) } : {}),
        ...(section.cta ? { cta: { ...section.cta } } : {}),
      })),
      faqs: form.faqs.map(item => ({ q: item.q.trim(), a: item.a.trim() })),
      related_links: form.related.map(link => ({ ...link })),
      ...(form.final_cta ? { final_cta: { ...form.final_cta } } : {}), media: form.media.map(image => ({ ...image })),
      ...(form.section_order ? { section_order: [...form.section_order] } : {}),
    });
  } catch { return null; }
}
