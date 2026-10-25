// Produce the deployment-ready social metadata fragment without guessing a domain.
// Usage: node scripts/social-origin.mjs https://YOUR-CONFIRMED-DOMAIN output.html
import fs from 'node:fs';
const [origin,output]=process.argv.slice(2);
if(!origin||!output){console.error('Supply the confirmed HTTPS site origin and an output path. No files changed.');process.exit(1)}
const u=new URL(origin);
if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new Error('Expected an HTTPS origin only.');
const esc=s=>s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
fs.writeFileSync(output,`<meta property="og:url" content="${esc(u.origin)}/">\n<meta property="og:image" content="${esc(u.origin)}/og-image.png">\n<meta name="twitter:image" content="${esc(u.origin)}/og-image.png">\n`);
