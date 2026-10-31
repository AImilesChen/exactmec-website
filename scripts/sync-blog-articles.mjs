import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=async file=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
const write=async(file,value)=>fs.writeFile(path.join(root,file),JSON.stringify(value,null,2)+'\n');
const articles=await read('src/data/blog-articles.json');
const contentPath=path.join(root,'src/data/site-content.json');
const contentText=await fs.readFile(contentPath,'utf8');
const content=await read('src/data/site-content.json');
const manifest=await read('src/data/site-manifest.json');
const ids=new Set(articles.map(article=>article.id));
const paths=new Set(articles.map(article=>article.path));
if(ids.size!==articles.length||paths.size!==articles.length||articles.some(article=>!/^blog-[a-z0-9-]+$/.test(article.id)||!/^\/blog\/[a-z0-9-]+\/$/.test(article.path)||article.kind!=='article'))throw new Error('Invalid or duplicate blog article id/path.');
const reserved=content.filter(page=>!page.id.startsWith('blog-'));
if(reserved.some(page=>ids.has(page.id)||paths.has(page.path)))throw new Error('Blog id/path collides with an existing page.');
const index={id:'blog',path:'/blog/',phase:'P0',kind:'collection',title:'Aluminum Die Casting Mold Blog | EXACTMEC',description:'Technical articles on aluminum die casting mold structure, part design, gating, venting, cooling and trial samples.',eyebrow:'EXACTMEC MOLD KNOWLEDGE',h1:'Inside the Mold',intro:'Practical knowledge about aluminum die casting molds, from the steel tool to the casting it produces.',sections:[],related_links:[]};
const nextContent=[...reserved.filter(page=>page.id!=='blog'),index,...articles];
const routeFor=page=>({id:page.id,path:page.path,phase:'P0',kind:page.kind,copy_source:page.id==='blog'?'src/BlogPages.jsx':'src/data/blog-articles.json',data_source:'site-content.json',public_now:true,index_when_released:true,include_in_p0_plan:true,p0_link_target:page.path,canonical_template:'{SITE_ORIGIN}'+page.path});
manifest.routes=[...manifest.routes.filter(route=>route.id!=='blog'&&!route.id.startsWith('blog-')),...[index,...articles].map(routeFor)];
manifest.marketing_pages=manifest.routes.filter(route=>!['legal','system'].includes(route.kind)).length;
manifest.p0_marketing_pages=manifest.routes.filter(route=>route.phase==='P0'&&!['legal','system'].includes(route.kind)).length;
// Keep the hand-formatted source pages intact. Some existing component galleries
// use compact JSON lines, so rewriting the whole file creates a misleading diff.
const blogStart=contentText.indexOf('\n  {\n    "id": "blog",');
const baseText=blogStart<0?contentText:contentText.slice(0,blogStart).replace(/,\s*$/,'')+'\n]\n';
const basePages=JSON.parse(baseText);
if(JSON.stringify(basePages)!==JSON.stringify(reserved.filter(page=>page.id!=='blog')))throw new Error('Blog block is not the final block in site-content.json.');
const serialized=[index,...articles].map(page=>JSON.stringify(page,null,2).split('\n').map(line=>'  '+line).join('\n')).join(',\n');
if(!/\n\]\s*$/.test(baseText))throw new Error('Unexpected site-content.json ending.');
await fs.writeFile(contentPath,baseText.replace(/\n\]\s*$/,`,\n${serialized}\n]\n`));
await write('src/data/site-manifest.json',manifest);
console.log(`Synchronized blog index and ${articles.length} articles into public routes and CMS source pages.`);
