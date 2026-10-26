import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const fixture=new URL(`.measurement-component-${process.pid}-${Date.now()}.mjs`,import.meta.url);
let applyMeasurementChoice,MeasurementPanel,MeasurementChoices;
before(async()=>{
 const result=await build({entryPoints:[fileURLToPath(new URL('../src/analytics/MeasurementChoices.jsx',import.meta.url))],bundle:true,platform:'node',format:'esm',packages:'external',write:false,logLevel:'silent'});
 await writeFile(fixture,result.outputFiles[0].text);({applyMeasurementChoice,MeasurementPanel,MeasurementChoices}=await import(fixture.href));
});
after(async()=>{await unlink(fixture).catch(()=>{});});
const key='exactmec_measurement_choice_v2';
function memoryStorage(log=[]){const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>{log.push({action:'save',key,value});values.set(key,value);},removeItem:key=>values.delete(key)};}

test('rejection persists the v2 refusal before the controller may stop and reload',()=>{
 const log=[],storage=memoryStorage(log),analytics={setConsent(value){log.push({action:'consent',value});assert.equal(storage.getItem(key),'deny');},track(){throw Error('Rejection cannot emit a pageview');}};
 storage.setItem(key,'allow');log.length=0;
 const result=applyMeasurementChoice({storage,analytics,route:'/',previousChoice:'allow'},false);
 assert.deepEqual(result,{choice:'deny',saved:true});
 assert.ok(log.findIndex(item=>item.key===key&&item.value==='deny')<log.findIndex(item=>item.action==='consent'));
});

test('explicit permission can emit one initial marketing pageview without transmitting choice-panel data',()=>{
 const log=[],storage=memoryStorage(log),events=[];
 const result=applyMeasurementChoice({storage,analytics:{setConsent(value){log.push({action:'consent',value});},track:(...args)=>events.push(args)},route:'/aluminum-die-casting-molds/',previousChoice:null},true);
 assert.deepEqual(result,{choice:'allow',saved:true});assert.deepEqual(events,[['pageview',{route:'/aluminum-die-casting-molds/'}]]);
 assert.ok(log.findIndex(item=>item.key===key&&item.value==='allow')<log.findIndex(item=>item.action==='consent'));
 events.length=0;applyMeasurementChoice({storage,analytics:{setConsent(){},track:(...args)=>events.push(args)},route:'/',previousChoice:'allow'},true);assert.equal(events.length,0);
});

test('forms, account/admin, legal/system and unregistered paths never get consent-triggered pageviews',()=>{
 for(const route of ['/request-a-quote/','/account/login/','/account/inquiries/','/admin/leads/','/privacy','/cookies','/inquiry-received/','/404','/unknown/?email=private@example.invalid']){
  const events=[];applyMeasurementChoice({storage:memoryStorage(),analytics:{setConsent(){},track:(...args)=>events.push(args)},route,previousChoice:null},true);assert.equal(events.length,0,route);
 }
});

test('blocked storage cannot be reported as a saved preference, but refusal still reaches the controller',()=>{
 const seen=[];const result=applyMeasurementChoice({storage:{getItem(){return null;},setItem(){throw Error('Storage blocked');}},analytics:{setConsent:value=>seen.push(value)},route:'/',previousChoice:'allow'},false);
 assert.deepEqual(result,{choice:'deny',saved:false});assert.deepEqual(seen,[false]);
});

test('panel truthfully names vendors, recordings, cookies and excluded customer surfaces with balanced actions',()=>{
 const html=renderToStaticMarkup(React.createElement(MeasurementPanel,{id:'measurement-test',choice:'deny',onChoose(){}}));
 for(const text of ['Google Analytics 4','Microsoft Clarity','session recordings and heatmaps','ShipSolo-hosted analytics (Plausible)','public marketing pages','device, IP address','Inquiry forms, customer accounts, and admin pages are excluded','inquiry fields are not sent','Reject optional tracking','Allow analytics and recordings'])assert.ok(html.includes(text),text);
 assert.match(html,/href="\/cookies"/);assert.match(html,/href="\/privacy"/);assert.match(html,/data-clarity-mask="true"/);assert.match(html,/aria-label="Optional tracking permission"/);
 assert.doesNotMatch(html,/No visitor identifiers|No advertising pixels|No SDK|inquiries require consent/i);
});

test('a storage failure is disclosed without claiming permanent preference saving',()=>{
 const html=renderToStaticMarkup(React.createElement(MeasurementPanel,{id:'measurement-test',choice:'allow',storageWarning:true,onChoose(){}}));
 assert.match(html,/could not save this preference/);assert.match(html,/applies to this page/);assert.match(html,/Current permission: allowed/);
});

test('measurement banner is client-only and disabled rendering never invokes analytics',()=>{
 let calls=0;const analytics={setConsent(){calls++;},track(){calls++;}};
 for(const enabled of [false,true])assert.equal(renderToStaticMarkup(React.createElement(MeasurementChoices,{enabled,analytics,route:'/'})),'');
 assert.equal(calls,0);
});
