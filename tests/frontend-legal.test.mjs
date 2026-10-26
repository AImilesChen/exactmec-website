import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
let server,LegalPage;
before(async()=>{
 server=await createServer({configFile:false,cacheDir:'.wrangler/legal-tests-cache',plugins:[react()],optimizeDeps:{noDiscovery:true,entries:[]},server:{middlewareMode:true},appType:'custom'});
 ({LegalPage}=await server.ssrLoadModule('/src/SitePages.jsx'));
});
after(async()=>server?.close());
const page={path:'/privacy',title:'Privacy Policy',summary:'How we handle mold inquiries.',markdown:'# Privacy Policy\n\n## Contact\n\nEmail sales@exactmec.com.'};
test('an approved published policy contains its public summary without internal design notes',()=>{
 const html=renderToStaticMarkup(React.createElement(LegalPage,{page:{...page,draft:false},reviewMode:false}));
 assert.match(html,/How we handle mold inquiries/);assert.match(html,/Email sales@exactmec.com/);
 assert.doesNotMatch(html,/LEGAL REVIEW COPY|Not yet published|Design preview|details remain unconfirmed/);
});
test('an unapproved policy keeps a review notice even when a caller requests public presentation',()=>{
 const html=renderToStaticMarkup(React.createElement(LegalPage,{page:{...page,draft:true},reviewMode:false}));
 assert.match(html,/LEGAL REVIEW COPY/);assert.match(html,/Not yet published/);
});
