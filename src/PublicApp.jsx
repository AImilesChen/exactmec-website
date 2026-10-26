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
import {createFirstPartyTransport,readMeasurementChoice,browserStorage} from './analytics/transport.mjs';
import {MeasurementChoices} from './analytics/MeasurementChoices.jsx';
import {createInquirySourceTracker} from './source/inquiry-source.mjs';
import {CmsProvider} from './cms/Rendering.jsx';
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

export function PublicApp({initialUrl,config=siteConfig,inquiryDefaults,cmsBundle}) {
 const [url,setUrl]=useState(()=>initialUrl||(typeof window==='undefined'?'/':location.pathname+location.search+location.hash));
 const pathname=url.split(/[?#]/)[0];
 const mapped=cmsBundle?.pages?.find(p=>p.path===pathname||p.path===pathname+'/');
 const original=mapped?pages.find(p=>p.id===mapped.id)?.path:null;
 const withdrawn=cmsBundle?.withdrawn?.includes(pathname);
 const resolution=withdrawn?{status:404,path:pathname}:mapped?{status:200,path:original||mapped.path}:resolvePublicRoute(pathname,{allowLegalDrafts:!config.release||config.legalApproved});
 const path=resolution.path;
 const sourceKnownPaths=useMemo(()=>cmsBundle?.pages?.map(page=>page.path)||[],[cmsBundle]);
 const sourceTracker=useMemo(()=>createInquirySourceTracker({knownPaths:sourceKnownPaths,blockedPaths:cmsBundle?.withdrawn||[]}),[sourceKnownPaths,cmsBundle]);
 const analytics=useMemo(()=>createAnalytics({enabled:config.analyticsEnabled,consent:typeof window!=='undefined'&&readMeasurementChoice(browserStorage()),adapter:createFirstPartyTransport()}),[config.analyticsEnabled]);
 useEffect(()=>()=>analytics.destroy(),[analytics]);
 useEffect(()=>bindSiteAnalytics(document,analytics),[analytics]);
 useEffect(()=>{const change=()=>setUrl(location.pathname+location.search+location.hash);addEventListener('popstate',change);return()=>removeEventListener('popstate',change)},[]);
 useEffect(()=>{
  applyMetadata(getPageMeta(path,{origin:config.origin,release:config.release,whatsappNumber:config.whatsappNumber,pageOverride:mapped}));
  analytics.track('pageview',{route:path});
  const hash=url.split('#')[1];
  if(hash){let id;try{id=decodeURIComponent(hash)}catch{return;}requestAnimationFrame(()=>document.getElementById(id)?.scrollIntoView({behavior:'auto'}));}
 },[url,path,config,analytics,mapped]);
 function go(href) {
  const next=new URL(href,location.origin);
  const custom=cmsBundle?.pages?.find(p=>p.path===next.pathname||p.path===next.pathname+'/');
  const resolved=custom?{redirect:null}:resolvePublicRoute(next.pathname,{allowLegalDrafts:!config.release||config.legalApproved});
  const target=resolved.redirect||next.pathname+next.search+next.hash;
  history.pushState({},'',target);setUrl(location.pathname+location.search+location.hash);
  if(!target.includes('#')){window.scrollTo({top:0,behavior:'instant'});requestAnimationFrame(()=>{const heading=document.querySelector('main h1');if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}});}
 }
 const sourcePage=pages.find(p=>p.path===path),page=mapped||sourcePage,policy=legal.find(p=>p.path===path);
 const body=resolution.status===404?<SystemPage notFound/>:path==='/request-a-quote/'?<Inquiry key={path} heading={mapped&&mapped.h1!==sourcePage?.h1?mapped.h1:undefined} intro={mapped&&mapped.intro!==sourcePage?.intro?mapped.intro:undefined} reviewMode={false} initialData={inquiryDefaults} getSourceSnapshot={()=>sourceTracker.snapshot()} sourceKnownPaths={sourceKnownPaths} submitEnabled={config.inquiryEnabled} endpoint={config.inquiryEndpoint} whatsappNumber={config.whatsappNumber} onEvent={(name,payload={})=>analytics.track(name,{route:path,...payload})}/>:path==='/'?<LightHome/>:policy?<LegalPage page={policy} reviewMode={!config.release||!config.legalApproved}/>:path==='/inquiry-received/'?<SystemPage/>:page?<ContentPage page={page}/>:<SystemPage notFound/>;
 return <CmsProvider value={cmsBundle}><Route.Provider value={go}><a className="skip-link" href="#main-content">Skip to content</a><MegaHeader url={url}/><main id="main-content">{body}</main><SiteFooter reviewMode={false} config={config}/><MeasurementChoices enabled={config.analyticsEnabled} analytics={analytics} route={path}/></Route.Provider></CmsProvider>;
}
