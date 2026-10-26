import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const fixture=new URL(`.customer-component-${process.pid}-${Date.now()}.mjs`,import.meta.url);
let CustomerPortal;
before(async()=>{
 const result=await build({entryPoints:[fileURLToPath(new URL('App.jsx',import.meta.url))],bundle:true,platform:'node',format:'esm',packages:'external',write:false,logLevel:'silent'});
 await writeFile(fixture,result.outputFiles[0].text);({CustomerPortal}=await import(fixture.href));
});
after(async()=>{await unlink(fixture).catch(()=>{});});

test('closed availability SSR shows the designed login without enabled controls or session claims',()=>{
 let calls=0;const client=new Proxy({}, {get(){return()=>{calls++;throw new Error('No API may run while rendering a closed portal');};}});
 const html=renderToStaticMarkup(React.createElement(CustomerPortal,{available:false,client}));
 assert.match(html,/Your mold inquiry,/);assert.match(html,/Customer sign-in is not open yet/);assert.match(html,/type="email"[^>]*disabled=""/);assert.match(html,/<button[^>]*disabled=""[^>]*>Continue with email/);
 assert.match(html,/href="\/request-a-quote\/"[^>]*>Submit an inquiry without signing in/);assert.doesNotMatch(html,/Checking customer access|Check sign-in availability|Your inquiries|Sign out|Email code<|code has been sent|code will arrive/);assert.equal(calls,0);
});

test('closed availability also guards detail URLs without rendering customer records',()=>{
 let calls=0;const client={session(){calls++;throw Error('Must not run');}};
 const html=renderToStaticMarkup(React.createElement(CustomerPortal,{initialPath:'/account/inquiries/EM_SYNTHETIC_12345678/',available:false,client}));
 assert.match(html,/Customer sign-in is not open yet/);assert.doesNotMatch(html,/Your original submission|Additional information|EM_SYNTHETIC_12345678|Withdraw this inquiry/);assert.equal(calls,0);
});

test('default availability waits for a real session rather than inventing signed-in content',()=>{
 const html=renderToStaticMarkup(React.createElement(CustomerPortal,{client:{session(){throw Error('SSR cannot call session');}}}));
 assert.match(html,/Checking customer access/);assert.doesNotMatch(html,/Your original submission|Customer sign-in is not open yet|Quotation sent/);
});
