// Short default labels belong to the selected design; explicit CMS edits still win.
export function homeCards(page,source,sectionId,presets) {
 const baseline=source.sections.find(section=>section.id===sectionId)?.cards||[];
 const current=page.sections.find(section=>section.id===sectionId)?.cards||[];
 return presets.flatMap(preset=>{
  const index=baseline.findIndex(card=>card.href===preset.href),original=baseline[index];
  if(!original)return [preset];
  const edited=current.find(card=>card.href===original.href)||(current.length===baseline.length?current[index]:null);
  if(!edited)return [];
  return [{...preset,title:edited.title!==original.title?edited.title:preset.title,href:edited.href}];
 });
}
export function homeHeroMedia(page) {
 const image=page.media?.find(item=>item.original==='/assets/home-v2-hero.webp')||page.media?.find(item=>item.original==='/assets/mold-hero-roomy-v3.webp');
 return {src:image?.path||'/assets/home-v2-hero.webp',alt:image?.alt||'Illustrative open die casting mold with a matching aluminum component',caption:image?.caption||'Illustrative example'};
}
