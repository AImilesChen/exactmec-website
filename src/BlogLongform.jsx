import React from 'react';
import {ArrowRight,CheckCircle} from '@phosphor-icons/react';
import markdown from './data/blog-parting-longform.md?raw';

const slug=value=>value.toLowerCase().replace(/^\d+\.\s*/,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const external=url=>/^https:\/\/[a-z0-9.-]+(?:\/[^\s]*)?$/i.test(url);
const internal=url=>/^\/[a-z0-9/#-]+$/i.test(url);

function inline(value){
 const nodes=[];
 const pattern=/\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
 let cursor=0,match;
 while((match=pattern.exec(value))){
  if(match.index>cursor)nodes.push(value.slice(cursor,match.index));
  if(match[3])nodes.push(<strong key={nodes.length}>{match[3]}</strong>);
  else if(external(match[2])||internal(match[2]))nodes.push(<a key={nodes.length} href={match[2]} {...(external(match[2])?{target:'_blank',rel:'noopener noreferrer'}:{})}>{match[1]}</a>);
  else nodes.push(match[0]);
  cursor=pattern.lastIndex;
 }
 if(cursor<value.length)nodes.push(value.slice(cursor));
 return nodes;
}

function parse(source){
 const lines=source.replace(/\r/g,'').split('\n');
 const result={title:'',intro:[],sections:[]};
 let blocks=result.intro,paragraph=[];
 const flush=()=>{if(paragraph.length){blocks.push({type:'paragraph',text:paragraph.join(' ')});paragraph=[];}};
 for(let index=0;index<lines.length;index++){
  const line=lines[index].trim();
  if(!line){flush();continue;}
  if(line.startsWith('# ')){flush();result.title=line.slice(2);continue;}
  if(line.startsWith('## ')){
   flush();const heading=line.slice(3).replace(/^\d+\.\s*/,'');
   const section={id:slug(heading),heading,blocks:[]};result.sections.push(section);blocks=section.blocks;continue;
  }
  if(line.startsWith('### ')){flush();blocks.push({type:'subheading',text:line.slice(4)});continue;}
  if(line.startsWith('> ')){flush();blocks.push({type:'callout',text:line.slice(2)});continue;}
  if(line.startsWith('|')){
   flush();const rows=[];
   while(index<lines.length&&lines[index].trim().startsWith('|')){
    const cells=lines[index].trim().replace(/^\||\|$/g,'').split('|').map(cell=>cell.trim());
    if(!cells.every(cell=>/^:?-{3,}:?$/.test(cell)))rows.push(cells);
    index++;
   }
   index--;if(rows.length>1)blocks.push({type:'table',columns:rows[0],rows:rows.slice(1)});
   continue;
  }
  const unordered=/^- (.+)$/.exec(line),ordered=/^\d+\. (.+)$/.exec(line);
  if(unordered||ordered){
   flush();const type=ordered?'ordered':'unordered';
   const last=blocks.at(-1);
   if(last?.type===type)last.items.push((ordered||unordered)[1]);
   else blocks.push({type,items:[(ordered||unordered)[1]]});
   continue;
  }
  paragraph.push(line);
 }
 flush();return result;
}

export const partingLongform=parse(markdown);

function Block({block}){
 if(block.type==='paragraph')return <p>{inline(block.text)}</p>;
 if(block.type==='callout')return <aside className="blog-longform-callout">{inline(block.text)}</aside>;
 if(block.type==='subheading')return <h3>{inline(block.text)}</h3>;
 if(block.type==='ordered'||block.type==='unordered'){
  const Tag=block.type==='ordered'?'ol':'ul';
  return <Tag className="blog-longform-list">{block.items.map((item,index)=><li key={index}>{inline(item)}</li>)}</Tag>;
 }
 if(block.type==='table')return <div className="blog-longform-table" role="region" aria-label={block.columns.join(', ')} tabIndex="0"><table><thead><tr>{block.columns.map((column,index)=><th scope="col" key={index}>{inline(column)}</th>)}</tr></thead><tbody>{block.rows.map((row,index)=><tr key={index}>{row.map((cell,at)=><td key={at}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>;
 return null;
}

function ReleaseDiagram(){return <figure className="blog-release-diagram"><p className="blog-diagram-label">ILLUSTRATIVE DESIGN REVIEW</p><div className="blog-diagram-steps"><div><span>01</span><strong>Set the opening direction</strong><small>How will the main halves separate?</small></div><ArrowRight aria-hidden="true"/><div><span>02</span><strong>Trace the parting line</strong><small>Which faces cross the split?</small></div><ArrowRight aria-hidden="true"/><div><span>03</span><strong>Check every release path</strong><small>Where are draft or moving cores needed?</small></div></div><figcaption>Illustrative diagram: assess the parting line, draft and trapped features together.</figcaption></figure>}

export function BlogLongform(){return <><div className="blog-longform-intro">{partingLongform.intro.map((block,index)=><Block key={index} block={block}/>)}</div>{partingLongform.sections.map((section,index)=><section id={section.id} key={section.id}><p className="blog-section-number">{String(index+1).padStart(2,'0')} / {String(partingLongform.sections.length).padStart(2,'0')}</p><h2>{section.heading}</h2>{section.blocks.map((block,at)=><Block key={at} block={block}/>)}{index===0&&<ReleaseDiagram/>}</section>)}</>}
