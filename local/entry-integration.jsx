// Separate localhost-only development entry. Never referenced by frontend.html
// or included in the public build. Fixtures are synthetic, not customer records.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {PublicApp} from '../src/PublicApp.jsx';
import {siteConfig} from '../src/site-config.mjs';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '../src/styles.css';
import '../src/redesign.css';
import '../src/compositions.css';
import '../src/v3.css';
const fixture={name:'Synthetic Buyer',company:'Example Tooling Test',email:'buyer@example.com',phone:'+1 202 555 0140',country:'Malaysia',city:'Synthetic City',component:'Synthetic motor housing',description:'Synthetic local integration fixture only. No actual customer or production request.',drawing_status:'Not sure yet'};
createRoot(document.getElementById('root')).render(<><div style={{background:'#fff0b8',color:'#443100',padding:'12px 24px',textAlign:'center',fontSize:14}}>仅本机合成联调 · 不接真实询价、不发送邮件或 WhatsApp · 测试邮箱须为 @example.com，测试号码 +1 202 555 0140 · <a href="/admin/leads/">查看本机询价后台</a></div><PublicApp config={{...siteConfig,origin:'',inquiryEnabled:true,whatsappNumber:'',localSynthetic:true}} inquiryDefaults={fixture}/></>);
