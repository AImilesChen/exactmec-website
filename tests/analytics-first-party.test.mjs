import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnalytics} from '../src/analytics/index.mjs';
import {createFirstPartyTransport,readMeasurementChoice,saveMeasurementChoice,MEASUREMENT_CHOICE_KEY,readSavedMeasurementChoice,MEASUREMENT_WITHDRAWAL_HASH} from '../src/analytics/transport.mjs';
test('no request before a measurement choice; refusal and withdrawal leave inquiry unaffected',async()=>{
 const sent=[],adapter=createFirstPartyTransport({fetchImpl:async(...args)=>{sent.push(args);return new Response(null,{status:204});}});
 const a=createAnalytics({enabled:true,adapter});
 assert.equal(a.track('pageview',{route:'/'}),false);assert.equal(sent.length,0);
 a.setConsent(true);assert.equal(a.track('inquiry_submit_success',{route:'/request-a-quote/',status:'saved',email:'never-forward@example.com'}),true);
 assert.equal(sent.length,1);const [url,options]=sent[0];assert.equal(url,'/api/events');assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.deepEqual(JSON.parse(options.body),{event:'inquiry_submit_success',payload:{route:'/request-a-quote/',status:'saved'},choice:'allow'});
 a.setConsent(false);assert.equal(a.track('pageview',{route:'/'}),false);assert.equal(sent.length,1);
});
test('blocked storage cannot grant consent or break the page',()=>{
 const blocked={getItem(){throw Error();},setItem(){throw Error();}};
 assert.equal(readMeasurementChoice(blocked),false);assert.doesNotThrow(()=>saveMeasurementChoice(blocked,true));
 const store=new Map(),storage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 assert.equal(saveMeasurementChoice(storage,true),true);assert.equal(readMeasurementChoice(storage),true);saveMeasurementChoice(storage,false);assert.equal(readMeasurementChoice(storage),false);assert.deepEqual([...store],[[MEASUREMENT_CHOICE_KEY,'deny']]);
});
test('old notice allowance and read-only allowance cannot authorize new vendors; withdrawal marker stays denied',()=>{
 const old={getItem:key=>key==='exactmec_measurement_choice'?'allow':null};assert.equal(readSavedMeasurementChoice(old),null);
 const readonly={getItem:key=>key===MEASUREMENT_CHOICE_KEY?'allow':null,setItem(){throw Error('readonly');},removeItem(){throw Error('readonly');}};
 assert.equal(readMeasurementChoice(readonly),false);assert.equal(saveMeasurementChoice(readonly,false),false);
 assert.equal(readSavedMeasurementChoice(readonly,{hash:MEASUREMENT_WITHDRAWAL_HASH}),'deny');
});
