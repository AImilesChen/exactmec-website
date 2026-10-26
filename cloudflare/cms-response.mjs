import {render} from '../dist/cms-render/entry-server.mjs';
import {createSiteConfig,business} from '../src/site-config.mjs';
import {getPageMeta} from '../src/seo/metadata.mjs';
const yes=v=>v===true||v==='true';
const escape=v=>String(v).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export function publicRuntimeConfig(env,bundle){
 const config=createSiteConfig({origin:env.SITE_ORIGIN||business.siteOrigin,release:yes(env.RELEASE)&&!bundle.preview,legalApproved:yes(env.LEGAL_APPROVED),backendVerified:yes(env.BACKEND_VERIFIED),contactEmailVerified:yes(env.CONTACT_EMAIL_VERIFIED),inquiryEnabled:yes(env.COLLECTION_ENABLED),analyticsEnabled:yes(env.METRICS_ENABLED),externalAnalyticsEnabled:yes(env.EXTERNAL_ANALYTICS_ENABLED)&&!bundle.preview});
 return {...config,...bundle.settings,...(bundle.settings?.address?{correspondenceAddress:bundle.settings.address}:{}),...(bundle.settings?.whatsappNumber?{whatsappDisplay:'+'+bundle.settings.whatsappNumber}:{}),whatsappUrl:'https://wa.me/'+(bundle.settings?.whatsappNumber||config.whatsappNumber)};
}
export function renderPublishedHtml(shell,url,env,bundle,page,originalPath){
 const config=publicRuntimeConfig(env,bundle),meta=getPageMeta(originalPath,{origin:config.origin,release:config.release,pageOverride:page});
 const html=render(url,config,bundle);
 let output=shell.replace(/<!--exactmec:root:start-->[\s\S]*?<!--exactmec:root:end-->/,()=>'<!--exactmec:root:start--><div id="root">'+html+'</div><!--exactmec:root:end-->');
 output=output.replace(/<title>.*?<\/title>/s,()=>'<title>'+escape(meta.title)+'</title>');
 for(const [type,name,value]of [['name','description',meta.description],['name','robots',meta.robots],['property','og:title',meta.title],['property','og:description',meta.description],['property','og:url',meta.ogUrl],['name','twitter:title',meta.title],['name','twitter:description',meta.description]]){
  output=output.replace(new RegExp('<meta '+type+'="'+name+'"[^>]*\\/?'+'>'),()=>'<meta '+type+'="'+name+'" content="'+escape(value||'')+'"/>');
 }
 if(meta.canonical)output=output.replace(/<link rel="canonical"[^>]*>/,()=>'<link rel="canonical" href="'+escape(meta.canonical)+'"/>');
 output=output.replace(/<script type="application\/ld\+json" id="page-schema">[\s\S]*?<\/script>/,'');
 const schema=meta.jsonLd?'<script type="application/ld+json" id="page-schema">'+JSON.stringify(meta.jsonLd).replaceAll('<','\\u003c')+'</script>':'';
 const bootstrap='<script type="application/json" id="site-bootstrap">'+JSON.stringify({config,cmsBundle:bundle,initialUrl:url}).replaceAll('<','\\u003c')+'</script>';
 output=output.replace('</head>',()=>schema+'\n</head>').replace('</body>',()=>bootstrap+'\n</body>');
 return new Response(output,{headers:{'Content-Type':'text/html; charset=utf-8'}});
}
