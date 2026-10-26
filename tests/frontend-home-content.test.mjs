import test from 'node:test';
import assert from 'node:assert/strict';
import pages from '../src/data/site-content.json' with {type:'json'};
import {homeCards,homeHeroMedia} from '../src/cms/home-content.mjs';
const source=pages.find(page=>page.id==='home');
const section=source.sections.find(item=>item.id==='guides');
const presets=section.cards.map(card=>({title:'Short label',href:card.href,image:'illustrative.webp'}));
test('concise homepage defaults do not suppress explicit published card title and destination edits',()=>{
 assert.ok(homeCards(source,source,'guides',presets).every(card=>card.title==='Short label'));
 const page=structuredClone(source),cards=page.sections.find(item=>item.id==='guides').cards;
 cards[0].title='Owner edited cost guide';cards[0].href='/resources/';
 const result=homeCards(page,source,'guides',presets);
 assert.equal(result[0].title,'Owner edited cost guide');assert.equal(result[0].href,'/resources/');
 assert.equal(result[1].title,'Short label');
 cards.splice(0,1);assert.equal(homeCards(page,source,'guides',presets).length,2);
});
test('existing hero media replacements remain effective and an explicit V2 replacement takes precedence',()=>{
 const legacy={original:'/assets/mold-hero-roomy-v3.webp',path:'/assets/mold-cavity-detail-v3.webp',alt:'Owner illustrative detail',caption:'Illustrative owner selection'};
 assert.equal(homeHeroMedia({media:[legacy]}).src,legacy.path);
 const current={...legacy,original:'/assets/home-v2-hero.webp',path:'/assets/home-v2-process.webp'};
 assert.deepEqual(homeHeroMedia({media:[legacy,current]}),{src:current.path,alt:current.alt,caption:current.caption});
 assert.equal(homeHeroMedia({}).src,'/assets/home-v2-hero.webp');
});
