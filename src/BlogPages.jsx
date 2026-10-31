import React,{useContext,useState} from 'react';
import {ArrowRight,BookOpen,CheckCircle,Compass,Info,LinkSimple} from '@phosphor-icons/react';
import pages from './data/site-content.json';
import {Link} from './Navigation.jsx';
import {CmsContext,useCmsPage} from './cms/Rendering.jsx';
import {responsiveImageProps} from './responsive-image.mjs';

const sourceArticles=pages.filter(page=>page.id.startsWith('blog-')&&page.kind==='article');
const topics=['All topics','Mold fundamentals','Part design','Melt flow & cooling'];

const blogPhotos={
 hero:{src:'/assets/blog-hero-machining-v1.webp',alt:'CNC machining of a die casting mold cavity in a toolmaking workshop'},
 anatomy:{src:'/assets/blog-mold-anatomy-v2.webp',alt:'Complete open steel die casting mold with its two halves and a sample component'},
 parting:{src:'/assets/blog-parting-review-v2.webp',alt:'Complete die casting mold with a technician checking its parting seam'},
 flow:{src:'/assets/blog-gates-cooling-v2.webp',alt:'Complete open die casting mold with runner channels and cooling hose connections'},
};

function BlogPhoto({type,decorative=false,loading='lazy',sizes}){
 const photo=blogPhotos[type]||blogPhotos.anatomy;
 return <img src={photo.src} alt={decorative?'':photo.alt} loading={loading} {...responsiveImageProps(photo.src,sizes)}/>;
}

function BlogCard({source}){
 const article=useCmsPage(source);
 return <article className="blog-card"><Link className="blog-card-visual" href={article.path} aria-label={'Read '+article.h1}><BlogPhoto type={article.diagram} decorative sizes="(max-width: 620px) 100vw, (max-width: 900px) 50vw, 33vw"/><span>Illustrative scene</span></Link><div className="blog-card-body"><p className="blog-meta">{article.category} <span aria-hidden="true">·</span> {article.readTime} min read</p><h2><Link href={article.path}>{article.h1}</Link></h2><p>{article.description}</p><Link className="blog-read-link" href={article.path}>Read article <ArrowRight size={18} aria-hidden="true"/></Link></div></article>;
}

export function BlogIndex({page}){
 const [topic,setTopic]=useState('All topics');
 const cms=useContext(CmsContext);
 const articles=sourceArticles.map(article=>cms.pages?.find(page=>page.id===article.id)||article).filter(article=>!(cms.withdrawn||[]).includes(article.path)&&(topic==='All topics'||article.category===topic));
 return <div className="blog-page"><section className="blog-index-hero"><div className="container blog-hero-grid"><div><p className="blog-kicker">EXACTMEC · MOLD KNOWLEDGE</p><h1>{page.h1}</h1><p className="blog-hero-intro">{page.intro}</p><a className="blog-outline-button" href="#articles">Explore articles <ArrowRight size={18} aria-hidden="true"/></a></div><figure className="blog-hero-photo"><BlogPhoto type="hero" decorative loading="eager" sizes="(max-width: 900px) 100vw, 45vw"/><figcaption>Illustrative mold-making scene</figcaption></figure></div></section><section className="container blog-list-section" id="articles"><div className="blog-section-heading"><div><p className="blog-kicker">TECHNICAL LIBRARY</p><h2>Explore aluminum die casting molds</h2></div><p>Focused, practical explanations of mold structure and design decisions.</p></div><div className="blog-topic-filters" role="group" aria-label="Filter articles by topic">{topics.map(name=><button type="button" key={name} className={topic===name?'is-active':''} aria-pressed={topic===name} onClick={()=>setTopic(name)}>{name}</button>)}</div><div className="blog-card-grid">{articles.map(article=><BlogCard key={article.id} source={article}/>)}</div></section><section className="blog-index-end"><div className="container"><BookOpen size={32} aria-hidden="true"/><div><h2>Keep learning, then discuss your mold</h2><p>Our technical articles explain the principles. Your part drawing or sample determines the actual mold project.</p></div><Link href="/request-a-quote/" className="button primary">Discuss a mold project <ArrowRight size={18} aria-hidden="true"/></Link></div></section></div>;
}

export function BlogArticle({page:source}){
 const page=useCmsPage(source);
 const cms=useContext(CmsContext);
 const related=sourceArticles.map(article=>cms.pages?.find(item=>item.id===article.id)||article).filter(item=>item.id!==page.id&&!(cms.withdrawn||[]).includes(item.path)).slice(0,2);
 return <div className="blog-page blog-article"><div className="container blog-breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/blog/">Blog</Link><span>/</span><span>{page.h1}</span></div><header className="container blog-article-header"><div><p className="blog-kicker">{page.category?.toUpperCase()}</p><h1>{page.h1}</h1><p className="blog-deck">{page.intro}</p><p className="blog-byline">EXACTMEC Editorial <span aria-hidden="true">·</span> {page.publishedAt} <span aria-hidden="true">·</span> {page.readTime} min read</p></div><figure><BlogPhoto type={page.diagram} loading="eager" sizes="(max-width: 900px) 100vw, 42vw"/><figcaption>Illustrative manufacturing scene; mold details vary by project.</figcaption></figure></header><div className="container blog-reading-grid"><aside className="blog-toc"><p>ON THIS PAGE</p><nav aria-label="Article sections">{page.sections.map(section=><a key={section.id} href={'#'+section.id}>{section.heading}</a>)}</nav><Link href="/blog/">← All articles</Link></aside><article className="blog-prose"><div className="blog-intro-callout"><Info size={22} aria-hidden="true"/><p>{page.takeaway}</p></div>{page.sections.map((section,index)=><section id={section.id} key={section.id}><p className="blog-section-number">{String(index+1).padStart(2,'0')} / {String(page.sections.length).padStart(2,'0')}</p><h2>{section.heading}</h2>{section.paragraphs?.map((paragraph,i)=><p key={i}>{paragraph}</p>)}{(section.bullets||section.points)?.length>0&&<ul>{(section.bullets||section.points).map(point=><li key={point}><CheckCircle size={19} aria-hidden="true"/>{point}</li>)}</ul>}</section>)}<div className="blog-source-box"><h2>Further reading</h2><p>Technical references used to check this overview:</p><ul>{page.sources?.map(source=><li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label} <LinkSimple size={15} aria-hidden="true"/></a></li>)}</ul></div><div className="blog-article-cta"><Compass size={29} aria-hidden="true"/><div><h2>Have a component in mind?</h2><p>Share a clear 2D or 3D drawing, or tell us about a physical sample. We discuss the mold scope for your part.</p><Link className="button primary" href="/request-a-quote/">Start a mold inquiry <ArrowRight size={18} aria-hidden="true"/></Link></div></div></article></div><section className="container blog-related"><div className="blog-section-heading"><div><p className="blog-kicker">CONTINUE READING</p><h2>Related mold knowledge</h2></div><Link href="/blog/">View all articles <ArrowRight size={18} aria-hidden="true"/></Link></div><div className="blog-card-grid">{related.map(article=><BlogCard key={article.id} source={article}/>)}</div></section></div>;
}
