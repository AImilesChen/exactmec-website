import variants from './data/image-variants.json';

export function responsiveImageProps(src,sizes='(max-width: 760px) 100vw, 50vw'){
 const match=/^\/assets\/([a-zA-Z0-9_.-]+\.webp)$/.exec(src||'');
 const record=match&&variants[match[1]];
 if(!record)return {decoding:'async'};
 return {
  width:record.width,
  height:record.height,
  decoding:'async',
  ...(record.small?{srcSet:`/assets/${record.small} 720w, ${src} ${record.width}w`,sizes}:{}),
 };
}
