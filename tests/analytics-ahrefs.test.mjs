import test from 'node:test';
import assert from 'node:assert/strict';
import {createVendorAnalytics,VENDOR_ANALYTICS} from '../src/analytics/vendors.mjs';
import {MEASUREMENT_CHOICE_KEY,readSavedMeasurementChoice} from '../src/analytics/transport.mjs';

function fixture({href='https://exactmec.com/',referrer=''}={}){
 const scripts=[],events=[],nodes=new Map();
 const document={referrer,documentElement:{setAttribute(){},removeAttribute(){}},getElementById:id=>nodes.get(id),createElement:()=>({attributes:{},setAttribute(name,value){this.attributes[name]=value;},remove(){this.removed=true;}}),head:{appendChild(node){scripts.push(node);nodes.set(node.id,node);}}};
 const window={document,location:new URL(href)};
 const api=createVendorAnalytics({enabled:true,window,document,fetchImpl:async()=>({status:202})});
 return {api,scripts,events,window,tag:()=>scripts.find(s=>s.id==='exactmec-ahrefs'),load(){window.AhrefsAnalytics={sendEvent:(...args)=>events.push(args)};this.tag()?.onload();}};
}
test('new Ahrefs service requires the v3 notice instead of silently reusing the three-provider allowance',()=>{
 assert.equal(MEASUREMENT_CHOICE_KEY,'exactmec_measurement_choice_v3');
 assert.equal(readSavedMeasurementChoice({getItem:key=>key==='exactmec_measurement_choice_v2'?'allow':null}),null);
 const f=fixture();assert.equal(f.tag(),undefined);f.api.setConsent(false);assert.equal(f.tag(),undefined);
});
test('Ahrefs head tag has the exact key, canonical page and no automatic pageviews; late load sends one safe pageview',()=>{
 const f=fixture();f.api.setConsent(true);const tag=f.tag();
 assert.equal(tag.src,'https://analytics.ahrefs.com/analytics.js');assert.equal(tag.attributes['data-key'],'kwvnBi883wOXoELTpu9YWQ');
 assert.equal(tag.attributes['data-page-location'],'https://exactmec.com/');assert.ok(Object.hasOwn(tag.attributes,'data-no-pageview-auto'));
 assert.equal(tag.referrerPolicy,'no-referrer');assert.equal(tag.async,true);assert.equal(VENDOR_ANALYTICS.ahrefsKey,tag.attributes['data-key']);
 assert.deepEqual(f.events,[]);f.load();tag.onload();f.api.setConsent(true);f.api.track('pageview',{route:'/'});
 assert.deepEqual(f.events,[['pageview']]);assert.equal(f.scripts.filter(s=>s.id==='exactmec-ahrefs').length,1);
});
test('Ahrefs custom events receive only closed marketing fields, never contacts, references or project data',()=>{
 const f=fixture();f.api.setConsent(true);f.load();
 f.api.track('quote_cta_click',{route:'/',placement:'hero',email:'PRIVATE@example.invalid',reference:'PRIVATE',props:{phone:'PRIVATE'}});
 f.api.track('whatsapp_click',{route:'/',placement:'footer',description:'PRIVATE'});
 assert.deepEqual(f.events,[['pageview'],['quote_cta_click',{props:{route:'/',placement:'hero'}}],['whatsapp_click',{props:{route:'/',placement:'footer'}}]]);
 assert.doesNotMatch(JSON.stringify(f.events),/PRIVATE/);
});
test('Ahrefs never loads on inquiry/private, parameterized URLs, unsafe referrers or preview origins',()=>{
 for(const options of [{href:'https://exactmec.com/request-a-quote/'},{href:'https://exactmec.com/account/login/'},{href:'https://exactmec.com/?email=PRIVATE'},{href:'https://exactmec.com/#PRIVATE'},{href:'http://localhost/'},{referrer:'https://exactmec.com/account/inquiries/'},{referrer:'https://external.invalid/search?email=PRIVATE'}]){
  const f=fixture(options);f.api.setConsent(true);assert.equal(f.tag(),undefined,JSON.stringify(options));
 }
});
test('withdrawal and destruction cancel late Ahrefs initialization; an already loaded API stops until document unload',()=>{
 const late=fixture();late.api.setConsent(true);const tag=late.tag();late.api.setConsent(false);late.load();assert.deepEqual(late.events,[]);assert.equal(tag.removed,true);assert.equal(late.api.hasStarted(),true);
 const f=fixture();f.api.setConsent(true);f.load();f.api.setConsent(false);f.window.AhrefsAnalytics.sendEvent('PRIVATE');f.api.track('whatsapp_click',{route:'/'});assert.deepEqual(f.events,[['pageview']]);assert.equal(f.api.setConsent(true),false);
 const destroyed=fixture();destroyed.api.setConsent(true);destroyed.api.destroy();destroyed.load();assert.deepEqual(destroyed.events,[]);
});
