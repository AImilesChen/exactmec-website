import React, { createContext, useContext } from 'react';
import { cmsHref, orderCmsCards } from './navigation.mjs';
import {responsiveImageProps} from '../responsive-image.mjs';

export const CmsContext = createContext({ pages: [], routes: {}, withdrawn: [], settings: {} });
export function CmsProvider({ value, children }) { return <CmsContext.Provider value={value || { pages: [], routes: {}, withdrawn: [], settings: {} }}>{children}</CmsContext.Provider>; }
export function useCmsPage(source) { const cms = useContext(CmsContext); return cms.pages?.find(page => page.id === source?.id) || source; }
export function useCmsOrderedCards(cards) {
  const cms = useContext(CmsContext);
  return orderCmsCards(cards, cms);
}
export function useCmsHref(href) {
  const cms = useContext(CmsContext);
  return cmsHref(href, cms);
}
export function useCmsMedia(original, defaults = {}) {
  const cms = useContext(CmsContext);
  const override = (cms.currentPage?.media || []).find(image => image.original === original);
  return override ? { src: override.path, alt: override.alt, caption: override.caption, source: override.source } : { src: original, ...defaults };
}
export function CmsPageScope({ page, children }) { const cms = useContext(CmsContext); return <CmsContext.Provider value={{ ...cms, currentPage: page }}>{children}</CmsContext.Provider>; }
export function CmsImage({ src, alt, ...props }) { const image = useCmsMedia(src, { alt }); return <img {...responsiveImageProps(image.src)} {...props} src={image.src} alt={image.alt} />; }
export function CmsHome({ page, children, ...props }) {
  let ordered = React.Children.toArray(children);
  if (page.section_order) {
    const movable = new Map(ordered.filter(child => child.props?.id && page.section_order.includes(child.props.id)).map(child => [child.props.id, child]));
    let at = 0; const sequence = page.section_order.map(id => movable.get(id)).filter(Boolean);
    ordered = ordered.map(child => movable.has(child.props?.id) ? sequence[at++] : child);
  }
  return <CmsPageScope page={page}><div {...props}>{ordered}</div></CmsPageScope>;
}
