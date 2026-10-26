import React,{useState,useEffect,useMemo} from 'react';
import {MegaHeader} from './MegaHeader.jsx';
import {LightHome} from './LightHome.jsx';
import {ContentPage,LegalPage,SystemPage,pages,legal} from './SitePages.jsx';
import {SiteFooter} from './SiteFooter.jsx';
import {Inquiry} from './inquiry/Inquiry.jsx';
import {Route} from './Navigation.jsx';
import {siteConfig} from './site-config.mjs';
import {getPageMeta} from './seo/metadata.mjs';
import {resolvePublicRoute} from './seo/route-contract.mjs';
import {createAnalytics,bindSiteAnalytics} from './analytics/index.mjs';
import './delivery.css';

export function applyMetadata(meta) {
 document.title=meta.title;
 document.documentElement.lang='en';
 const set=(selector,attribute,value)=>{
  let node=document.head.querySelector(selector);
  if (!value) {node?.remove();return;}
  if(!node){node=document.createElement(selector.startsWith('link')?'link':selector.startsWith('script')?'script':'meta');
   if(selector.startsWith('link'))node.rel='canonical';
   else if(selector.startsWith('script')){node.type='application/ld+json';node.id='page-schema';}
   else {const m=selector.match(/\[(name|property)="([^"]+)"\]/);node.setAttribute(m[1],m[2]);}
   document.head.append(node);
  }
  if(attribute==='textContent')node.textContent=JSON.stringify(value).replace(/</g,'\\u003c');else node.setAttribute(attribute,value);
 };
 set('meta[name="description"]','content',meta.description);
 set('meta[name="robots"]','content',meta.robots);
 set('link[rel="canonical"]','href',meta.canonical);
 for(const [property,value] of Object.entries({'og:title':meta.title,'og:description':meta.description,'og:url':meta.ogUrl,'og:image':meta.image}))set(`meta[property="${property}"]`,'content',value);
 for(const [name,value] of Object.entries({'twitter:title':meta.title,'twitter:description':meta.description,'twitter:image':meta.image}))set(`meta[name="${name}"]`,'content',value);
 set('script#page-schema','textContent',meta.jsonLd);
}

export function PublicApp({initialUrl,config=siteConfig,inquiryDefaults}) {
 const [url,setUrl]=useState(()=>initialUrl||(typeof window==='undefined'?'/':location.pathname+location.search+location.hash));
 const pathname=url.split(/[?#]/)[0];
 const resolution=resolvePublicRoute(pathname,{allowLegalDrafts:!config.release||config.legalApproved});
 const path=resolution.path;
 const analytics=useMemo(()=>createAnalytics(),[]);
 useEffect(()=>()=>analytics.destroy(),[analytics]);
 useEffect(()=>bindSiteAnalytics(document,analytics),[analytics]);
 useEffect(()=>{const change=()=>setUrl(location.pathname+location.search+location.hash);addEventListener('popstate',change);return()=>removeEventListener('popstate',change)},[]);
 useEffect(()=>{
  applyMetadata(getPageMeta(path,{origin:config.origin,release:config.release,whatsappNumber:config.whatsappNumber}));
  analytics.track('pageview',{route:path});
  const hash=url.split('#')[1];
  if(hash){let id;try{id=decodeURIComponent(hash)}catch{return;}requestAnimationFrame(()=>document.getElementById(id)?.scrollIntoView({behavior:'auto'}));}
 },[url,path,config,analytics]);
 function go(href) {
  const next=new URL(href,location.origin);
  const resolved=resolvePublicRoute(next.pathname,{allowLegalDrafts:!config.release||config.legalApproved});
  const target=resolved.redirect||next.pathname+next.search+next.hash;
  history.pushState({},'',target);setUrl(location.pathname+location.search+location.hash);
  if(!target.includes('#')){window.scrollTo({top:0,behavior:'instant'});requestAnimationFrame(()=>{const heading=document.querySelector('main h1');if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}});}
 }
 const page=pages.find(p=>p.path===path),policy=legal.find(p=>p.path===path);
 const body=resolution.status===404?<SystemPage notFound/>:path==='/request-a-quote/'?<Inquiry key={path} reviewMode={false} initialData={inquiryDefaults} submitEnabled={config.inquiryEnabled} endpoint={config.inquiryEndpoint} whatsappNumber={config.whatsappNumber} onEvent={(name,payload={})=>analytics.track(name,{route:path,...payload})}/>:path==='/'?<LightHome/>:policy?<LegalPage page={policy} reviewMode={!config.release||!config.legalApproved}/>:path==='/inquiry-received/'?<SystemPage/>:page?<ContentPage page={page}/>:<SystemPage notFound/>;
 return <Route.Provider value={go}><a className="skip-link" href="#main-content">Skip to content</a><MegaHeader url={url}/><main id="main-content">{body}</main><SiteFooter reviewMode={false} config={config}/></Route.Provider>;
}
