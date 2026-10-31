import React from 'react';
import {ArrowRight,CheckCircle} from '@phosphor-icons/react';
import partingMarkdown from './data/blog-parting-longform.md?raw';
import anatomyMarkdown from './data/blog-anatomy-longform.md?raw';
import flowMarkdown from './data/blog-flow-longform.md?raw';

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

export const longformById={
 'blog-die-casting-mold-anatomy':parse(anatomyMarkdown),
 'blog-parting-line-draft-undercuts':parse(partingMarkdown),
 'blog-gates-vents-cooling':parse(flowMarkdown),
};

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

function AnatomyDiagram(){return <figure className="blog-system-map"><p className="blog-diagram-label">ILLUSTRATIVE MOLD ANATOMY</p><div className="blog-map-halves"><div><span>STATIONARY</span><strong>Cover half</strong><small>One shaped side of the cavity</small></div><div className="blog-map-center"><span>PARTING SURFACE</span><strong>Casting cavity</strong><small>The two halves close around the part shape</small></div><div><span>MOVING</span><strong>Ejector half</strong><small>Ejector pins help release the casting</small></div></div><div className="blog-map-flow"><span>Metal entry</span><ArrowRight aria-hidden="true"/><span>Runner</span><ArrowRight aria-hidden="true"/><span>Gate</span><ArrowRight aria-hidden="true"/><span>Cavity</span><ArrowRight aria-hidden="true"/><span>Vent / overflow</span></div><figcaption>Conceptual relationships only. Actual die arrangement, moving cores and cooling passages depend on the component and equipment.</figcaption></figure>}

function FlowDiagram(){return <figure className="blog-system-map"><p className="blog-diagram-label">ILLUSTRATIVE PATHS IN A DIE</p><div className="blog-map-flow"><span>Metal entry</span><ArrowRight aria-hidden="true"/><span>Runner</span><ArrowRight aria-hidden="true"/><span>Gate</span><ArrowRight aria-hidden="true"/><span>Cavity</span><ArrowRight aria-hidden="true"/><span>Vent / overflow</span></div><div className="blog-map-heat"><strong>Separate heat path</strong><span>Molten metal heats die steel</span><ArrowRight aria-hidden="true"/><span>Temperature-control passages remove heat</span></div><figcaption>Conceptual diagram. The air-exit and thermal paths are engineered with the filling path for the actual part; arrows do not predict a specific fill pattern.</figcaption></figure>}

const diagrams={'blog-die-casting-mold-anatomy':AnatomyDiagram,'blog-parting-line-draft-undercuts':ReleaseDiagram,'blog-gates-vents-cooling':FlowDiagram};
export function BlogLongform({articleId}){const article=longformById[articleId];if(!article)return null;const Diagram=diagrams[articleId];return <><div className="blog-longform-intro">{article.intro.map((block,index)=><Block key={index} block={block}/>)}</div>{article.sections.map((section,index)=><section id={section.id} key={section.id}><p className="blog-section-number">{String(index+1).padStart(2,'0')} / {String(article.sections.length).padStart(2,'0')}</p><h2>{section.heading}</h2>{section.blocks.map((block,at)=><Block key={at} block={block}/>)}{index===0&&Diagram&&<Diagram/>}</section>)}</>}
