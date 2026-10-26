import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const fixture=new URL(`.admin-login-panel-${process.pid}-${Date.now()}.mjs`,import.meta.url);
let AdminAccessPanel;
before(async()=>{
 const output=await build({entryPoints:[fileURLToPath(new URL('../src/admin/App.jsx',import.meta.url))],bundle:true,platform:'node',format:'esm',packages:'external',write:false,logLevel:'silent'});
 await writeFile(fixture,output.outputFiles[0].text);
 ({AdminAccessPanel}=await import(fixture.href));
});
after(async()=>{await unlink(fixture).catch(()=>{});});

test('unauthorized admin panel offers an actual fixed top-level sign-in link, separate from an API retry',()=>{
 const html=renderToStaticMarkup(React.createElement(AdminAccessPanel,{loading:false,onRetry(){throw Error('Rendering cannot request a session');}}));
 assert.match(html,/<a class="admin-button" href="\/admin\/leads\/">前往安全登录<\/a>/);
 assert.match(html,/<button[^>]+type="button"[^>]*>重新验证并加载<\/button>/);
 assert.doesNotMatch(html,/returnUrl|redirect_uri|token|localhost|example\.invalid/);
});
test('initial session verification waits without presenting an authenticated workspace or duplicate login action',()=>{
 const html=renderToStaticMarkup(React.createElement(AdminAccessPanel,{loading:true}));
 assert.match(html,/正在验证访问权限/);assert.doesNotMatch(html,/<a |<button|询盘列表|csrf/i);
});
