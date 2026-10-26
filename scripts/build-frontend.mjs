import {build,loadEnv} from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {business,createSiteConfig,releaseBlockers} from '../src/site-config.mjs';
import {PUBLIC_ROUTES} from '../src/seo/route-contract.mjs';
import {getPageMeta} from '../src/seo/metadata.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const release=process.argv.includes('--release');
const configured=loadEnv('frontend',root,'VITE_');
Object.assign(process.env,configured);
process.env.VITE_SITE_RELEASE=String(release);
const config=createSiteConfig({origin:process.env.VITE_SITE_ORIGIN||business.siteOrigin,contactEmail:process.env.VITE_CONTACT_EMAIL,contactEmailVerified:process.env.VITE_CONTACT_EMAIL_VERIFIED==='true',release,legalApproved:process.env.VITE_LEGAL_APPROVED==='true',backendVerified:process.env.VITE_BACKEND_VERIFIED==='true',inquiryEnabled:process.env.VITE_INQUIRY_ENABLED==='true'});
const blockers=releaseBlockers(config);
if(release&&blockers.length)throw new Error('Release is not ready:\n'+blockers.map(x=>' - '+x).join('\n'));
if(release){
 const notices=JSON.parse(await fs.readFile(path.join(root,'src/data/notice-versions.json'),'utf8'));
 const policies=JSON.parse(await fs.readFile(path.join(root,'src/data/legal-drafts.json'),'utf8'));
 if(Object.values(notices).some(value=>/draft|test|synthetic/i.test(value))||policies.some(p=>/INTERNAL DRAFT|\[[A-Z][A-Z0-9_]+\]/.test(p.markdown)))throw new Error('Release requires finalized legal copy and matching approved notice versions, not flags alone.');
}
const output=path.join(root,'dist/public'),serverOutput=path.join(root,'dist/server-render');
const manifest=JSON.parse(await fs.readFile(path.join(root,'src/data/site-manifest.json'),'utf8'));
const allCopy=JSON.parse(await fs.readFile(path.join(root,'src/data/site-content.json'),'utf8'));
const marketingPaths=new Set(PUBLIC_ROUTES.filter(r=>!['legal','system'].includes(r.kind)).map(r=>r.path));
const publicCopy=allCopy.filter(p=>marketingPaths.has(p.path));
const filteredCopy=()=>({name:'exactmec-public-copy',enforce:'pre',resolveId(id){if(id.endsWith('data/site-content.json'))return '\0exactmec-public-copy';},load(id){if(id==='\0exactmec-public-copy')return 'export default '+JSON.stringify(publicCopy);}});
await build({root,mode:'frontend',publicDir:false,plugins:[filteredCopy()],build:{outDir:output,emptyOutDir:true,rollupOptions:{input:{frontend:path.join(root,'frontend.html'),admin:path.join(root,'admin.html')},output:{manualChunks(id){if(/node_modules[\\/](?:react|react-dom|scheduler)[\\/]/.test(id))return 'react-vendor';}}}}});
await build({root,mode:'frontend',publicDir:false,plugins:[filteredCopy()],build:{ssr:path.join(root,'src/entry-server.jsx'),outDir:serverOutput,emptyOutDir:true,rollupOptions:{output:{entryFileNames:'entry-server.mjs'}}}});
const {render}=await import(pathToFileURL(path.join(serverOutput,'entry-server.mjs')).href+'?build='+Date.now());
const shell=await fs.readFile(path.join(output,'frontend.html'),'utf8');
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const tag=(name,content,property=false)=>content?`<meta ${property?'property':'name'}="${name}" content="${escape(content)}"/>`:'';
function head(meta){return [
 `<title>${escape(meta.title)}</title>`,tag('description',meta.description),tag('robots',meta.robots),
 meta.canonical?`<link rel="canonical" href="${escape(meta.canonical)}"/>`:'',
 tag('og:title',meta.title,true),tag('og:description',meta.description,true),tag('og:url',meta.ogUrl,true),tag('og:image',meta.image,true),
 tag('twitter:title',meta.title),tag('twitter:description',meta.description),tag('twitter:image',meta.image),
 meta.jsonLd?`<script type="application/ld+json" id="page-schema">${JSON.stringify(meta.jsonLd).replaceAll('<','\\u003c')}</script>`:'',
 ].filter(Boolean).join('\n');}
const generated=[];
for(const route of PUBLIC_ROUTES){
 const meta=getPageMeta(route.path,{origin:config.origin,release:config.release});
 let html=shell.replace(/<title>.*?<\/title>/s,'').replace(/<meta name="robots"[^>]*\/>/,'');
 html=html.replace('</head>',head(meta)+'\n</head>').replace('<div id="root"></div>','<div id="root">'+render(route.path,config)+'</div>');
 const filename=route.id==='404'?'404.html':route.path==='/'?'index.html':route.path.replace(/^\//,'').replace(/\/$/,'')+'/index.html';
 const dest=path.join(output,filename);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,html);
 generated.push({path:route.path,id:route.id,file:filename,kind:route.kind,robots:meta.robots,canonical:meta.canonical,status:route.id==='404'?404:200});
}
await fs.unlink(path.join(output,'frontend.html'));
await fs.mkdir(path.join(output,'admin'),{recursive:true});await fs.rename(path.join(output,'admin.html'),path.join(output,'admin/index.html'));
const publicDir=path.join(root,'public');
const rootFiles=['favicon.svg','favicon.ico','favicon-16x16.png','favicon-32x32.png','favicon-48x48.png','apple-touch-icon.png','icon-192.png','icon-512.png','og-image.png','site.webmanifest'];
for(const name of rootFiles)await fs.copyFile(path.join(publicDir,name),path.join(output,name));
await fs.mkdir(path.join(output,'brand'),{recursive:true});
for(const file of await fs.readdir(path.join(publicDir,'brand')))if(/\.(svg|png|webp)$/.test(file))await fs.copyFile(path.join(publicDir,'brand',file),path.join(output,'brand',file));

// Copy actual site imagery and fonts, not design boards, ZIPs or prompt files.
const needed=new Set();
const runtime=['LightHome.jsx','MegaHeader.jsx','EditorialPages.jsx','PageCompositions.jsx','Media.jsx','PhaseExplorer.jsx','SitePages.jsx','styles.css','redesign.css','compositions.css','v3.css','delivery.css'];
const assetData=JSON.parse(await fs.readFile(path.join(root,'src/data/v3-assets.json'),'utf8'));
for(const asset of assetData)if(asset.path)needed.add(path.basename(asset.path));
for(const file of runtime){const text=await fs.readFile(path.join(root,'src',file),'utf8');for(const match of text.matchAll(/["'(/]([A-Za-z0-9_.-]+\.(?:png|webp|jpe?g|svg))["')]/g))needed.add(match[1]);}
// ProductFigure converts legacy PNG references into runtime WebP names.
for(const name of [...needed])if(name.endsWith('.png')){needed.delete(name);needed.add(name.replace(/\.png$/,'.webp'));}
for(const row of generated){const html=await fs.readFile(path.join(output,row.file),'utf8');for(const match of html.matchAll(/<img\b[^>]*src="\/assets\/([A-Za-z0-9_.-]+)"/g))needed.add(match[1]);}
for(const name of needed)await fs.copyFile(path.join(publicDir,'assets',name),path.join(output,'assets',name));
const xml=config.release?generated.filter(r=>r.robots==='index,follow').map(r=>`  <url><loc>${escape(config.origin+r.path)}</loc></url>`).join('\n'):'';
await fs.writeFile(path.join(output,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${xml}\n</urlset>\n`);
await fs.writeFile(path.join(output,'robots.txt'),config.release?`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\nDisallow: /design-system/\nSitemap: ${config.origin}/sitemap.xml\n`:'User-agent: *\nDisallow: /\n');
const report={mode:release?'release':'staging',published:false,origin:config.origin||null,inquiryEnabled:config.inquiryEnabled,analyticsEnabled:false,generatedAt:new Date().toISOString(),routes:generated,marketingPages:publicCopy.length,publicAssets:[...needed],releaseBlockers:blockers,sourceContract:manifest.version};
await fs.writeFile(path.join(root,'dist/frontend-report.json'),JSON.stringify(report,null,2));
console.log(`Frontend ${report.mode}: ${generated.length} HTML pages (${publicCopy.length} marketing), no internal workbench/download assets. Online inquiry/analytics remain ${config.inquiryEnabled?'configured':'disabled'}.`);
