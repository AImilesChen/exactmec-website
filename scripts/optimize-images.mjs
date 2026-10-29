import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const assets=path.join(root,'public/assets');
const variants={};
for(const name of (await fs.readdir(assets)).filter(name=>name.endsWith('.webp')&&!name.endsWith('-720.webp')).sort()){
 const input=path.join(assets,name);
 const info=await sharp(input).metadata();
 if(!info.width||!info.height)continue;
 const record={width:info.width,height:info.height};
 if(info.width>900){
  const small=name.replace(/\.webp$/,'-720.webp');
  await sharp(input).resize({width:720,withoutEnlargement:true}).webp({quality:78,effort:4}).toFile(path.join(assets,small));
  record.small=small;
 }
 variants[name]=record;
}
await fs.writeFile(path.join(root,'src/data/image-variants.json'),JSON.stringify(variants,null,2)+'\n');
console.log(`Prepared ${Object.keys(variants).length} image records and ${Object.values(variants).filter(value=>value.small).length} mobile variants.`);
