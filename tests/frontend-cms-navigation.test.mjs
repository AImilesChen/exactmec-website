import test from 'node:test';
import assert from 'node:assert/strict';
import {cmsHref,orderCmsCards} from '../src/cms/navigation.mjs';
const bundle={routes:{'/about/':'/company/','/old-company/':'/company/','/industries/':'/applications/'},pages:[{path:'/company/',order:2},{path:'/resources/',order:3}],withdrawn:['/quality-control/','/industries/led-lighting/']};
test('original and old slug links, hashes and card order resolve to the published canonical path',()=>{
  assert.equal(cmsHref('/about',bundle),'/company/');assert.equal(cmsHref('/old-company/#operator',bundle),'/company/#operator');assert.equal(cmsHref('/company/#operator',bundle),'/company/#operator');
  const cards=[{title:'Other',href:'/products/'},{title:'Company',href:'/about#operator'},{title:'Resource',href:'/resources/'}];
  assert.deepEqual(orderCmsCards(cards,bundle).map(card=>card.title),['Company','Resource','Other']);assert.equal(cards[0].title,'Other');
});
test('withdrawn page fallback follows renamed overview and never returns a withdrawn overview itself',()=>{
  assert.equal(cmsHref('/quality-control/#requirements',bundle),'/');assert.equal(cmsHref('/industries/led-lighting/#details',bundle),'/applications/');
  const withdrawn={...bundle,withdrawn:[...bundle.withdrawn,'/industries/','/resources/','/resources/cost/']};
  assert.equal(cmsHref('/industries/',withdrawn),'/');assert.equal(cmsHref('/industries/led-lighting/',withdrawn),'/');assert.equal(cmsHref('/resources/cost/#details',withdrawn),'/');assert.equal(cmsHref('/resources/',withdrawn),'/');
  assert.equal(cmsHref('https://example.invalid',bundle),'https://example.invalid');
});
