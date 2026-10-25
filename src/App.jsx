import React,{useState,useEffect,useRef} from 'react';
import {ArrowRight,CaretDown,List,X,Plus,Minus,CheckCircle,ArrowLeft} from '@phosphor-icons/react';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import {LightHome} from './LightHome.jsx';
import {MegaHeader} from './MegaHeader.jsx';
import {Media} from './Media.jsx';
import {Route,Link} from './Navigation.jsx';
import {ContentPage,LegalPage,SystemPage,pages,legal} from './SitePages.jsx';
import {DesignStudio} from './DesignStudio.jsx';
import {Operations} from './Operations.jsx';
import {Inquiry} from './inquiry/Inquiry.jsx';
import {SiteFooter} from './SiteFooter.jsx';
import {siteConfig} from './site-config.mjs';
import './delivery.css';
const QUOTE='/request-a-quote/',TOOL='/aluminum-die-casting-molds/';

function Quote({className='',children='Request a Mold Quote'}){return <Link href={QUOTE} className={'button primary '+className}>{children}</Link>}
function TextLink({href,children}){return <Link href={href} className="text-link">{children}<ArrowRight size={21} aria-hidden="true"/></Link>}
function Home(){return <LightHome/>}
function Dialog({title,close,children}){const ref=useRef(null);useEffect(()=>{const before=document.activeElement;ref.current?.showModal();return()=>before?.focus()},[]);return <dialog ref={ref} className="dialog" onCancel={close} onClick={e=>{if(e.target===e.currentTarget)close()}}><div className="dialog-head"><h2>{title}</h2><button aria-label="Close dialog" onClick={close}><X size={26}/></button></div><div className="dialog-body">{children}</div></dialog>}
export function App(){const [url,setUrl]=useState(location.pathname+location.search+location.hash);const path=url.split(/[?#]/)[0];useEffect(()=>{const change=()=>setUrl(location.pathname+location.search+location.hash);addEventListener('popstate',change);return()=>removeEventListener('popstate',change)},[]);const go=href=>{history.pushState({},'',href);setUrl(location.pathname+location.search+location.hash);if(!href.includes('#'))window.scrollTo({top:0,behavior:'instant'});else requestAnimationFrame(()=>document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({behavior:'auto'}))};useEffect(()=>{const hash=url.split('#')[1];if(hash)requestAnimationFrame(()=>document.getElementById(hash)?.scrollIntoView({behavior:'auto'}))},[url]);const page=pages.find(p=>p.path===path),policy=legal.find(p=>p.path===path),admin=path.startsWith('/admin/'),studio=path.startsWith('/design-system/');useEffect(()=>{document.title=admin?'运营设计预览 | ExactMec':studio?'UI Design Kit | ExactMec':policy?policy.title+' | ExactMec':page?.title||'Page Not Found | ExactMec';document.documentElement.lang=admin||studio?'zh-CN':'en';const m=document.querySelector('meta[name=description]');if(m)m.content=page?.description||'ExactMec local UI design preview.';for(const selector of ['meta[property="og:title"]','meta[name="twitter:title"]']){const n=document.querySelector(selector);if(n)n.content=document.title}for(const selector of ['meta[property="og:description"]','meta[name="twitter:description"]']){const n=document.querySelector(selector);if(n)n.content=m?.content||''}},[path]);let body=admin?<Operations path={path}/>:path===QUOTE?<Inquiry key={url.split('#')[0]} reviewMode whatsappNumber={siteConfig.whatsappNumber}/>:path==='/'?<Home/>:policy?<LegalPage key={path} page={policy}/>:path==='/inquiry-received/'?<SystemPage/>:path==='/design-system/confirmation/'?<SystemPage previewSaved/>:path==='/design-system/duplicate/'?<SystemPage previewSaved duplicate/>:studio?<DesignStudio path={path}/>:page?<ContentPage key={path} page={page}/>:<SystemPage notFound/>;return <Route.Provider value={go}><a className="skip-link" href="#main-content">Skip to content</a>{admin?body:<><MegaHeader url={url}/><main id="main-content">{body}</main><SiteFooter/></>}</Route.Provider>}
