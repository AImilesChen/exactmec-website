export const isContentId = value => typeof value === 'string' && value.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export const isSourceHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

const plain = (value, max, multiline = false) => typeof value === 'string' && value.trim().length > 0 && value.length <= max
  && !/[<>\u007f-\u009f]/.test(value) && !(multiline ? /[\u0000-\u0009\u000b-\u001f]/ : /[\u0000-\u001f]/).test(value);
const keysOnly = (object, allowed) => object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).every(key => allowed.includes(key));

/** Closed editorial schema: paths, links, images, cards and tables cannot enter a patch. */
export function validateContentPatch(input) {
  if (!keysOnly(input, ['title', 'h1', 'description', 'sections', 'faqs'])) return null;
  const clean = {};
  for (const [key, max] of [['title', 160], ['h1', 240], ['description', 500]]) {
    if (Object.hasOwn(input, key)) { if (!plain(input[key], max)) return null; clean[key] = input[key]; }
  }
  if (Object.hasOwn(input, 'sections')) {
    if (!Array.isArray(input.sections) || input.sections.length > 100) return null;
    const ids = new Set();
    clean.sections = [];
    for (const section of input.sections) {
      if (!keysOnly(section, ['id', 'heading', 'paragraphs', 'bullets']) || !isContentId(section.id) || ids.has(section.id) || !plain(section.heading, 240)) return null;
      ids.add(section.id);
      const safe = { id: section.id, heading: section.heading };
      for (const [key, count, max] of [['paragraphs', 20, 4000], ['bullets', 30, 1000]]) {
        if (Object.hasOwn(section, key)) {
          if (!Array.isArray(section[key]) || section[key].length > count || section[key].some(value => !plain(value, max, true))) return null;
          safe[key] = [...section[key]];
        }
      }
      clean.sections.push(safe);
    }
  }
  if (Object.hasOwn(input, 'faqs')) {
    if (!Array.isArray(input.faqs) || input.faqs.length > 30) return null;
    clean.faqs = [];
    for (const faq of input.faqs) {
      if (!keysOnly(faq, ['q', 'a']) || !plain(faq.q, 500) || !plain(faq.a, 4000, true)) return null;
      clean.faqs.push({ q: faq.q, a: faq.a });
    }
  }
  return clean;
}

export function createContentForm(detail) {
  const page = detail.page;
  const draft = detail.draft || {};
  return {
    title: draft.title ?? page.title ?? '', h1: draft.h1 ?? page.h1 ?? '', description: draft.description ?? page.description ?? '',
    sections: (page.sections || []).map(section => {
      const patch = (draft.sections || []).find(item => item.id === section.id) || {};
      const result = { id: section.id, heading: patch.heading ?? section.heading ?? '' };
      if (Array.isArray(patch.paragraphs ?? section.paragraphs)) result.paragraphsText = (patch.paragraphs ?? section.paragraphs).join('\n\n');
      if (Array.isArray(patch.bullets ?? section.bullets)) result.bulletsText = (patch.bullets ?? section.bullets).join('\n');
      return result;
    }),
    faqs: (draft.faqs ?? page.faqs ?? []).map(item => ({ q: item.q, a: item.a })),
  };
}

export function buildContentPatch(form) {
  const split = (value, separator) => value.split(separator).map(item => item.trim()).filter(Boolean);
  return validateContentPatch({
    title: form.title.trim(), h1: form.h1.trim(), description: form.description.trim(),
    sections: form.sections.map(section => ({
      id: section.id, heading: section.heading.trim(),
      ...(Object.hasOwn(section, 'paragraphsText') ? { paragraphs: split(section.paragraphsText, /\r?\n\s*\r?\n/) } : {}),
      ...(Object.hasOwn(section, 'bulletsText') ? { bullets: split(section.bulletsText, /\r?\n/) } : {}),
    })),
    faqs: form.faqs.map(item => ({ q: item.q.trim(), a: item.a.trim() })),
  });
}
