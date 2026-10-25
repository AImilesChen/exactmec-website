import {createRemoteJWKSet,jwtVerify,SignJWT} from 'jose';

const keysets=new Map();
export function accessConfiguration(env={}) {
 const domain=String(env.ACCESS_TEAM_DOMAIN||'').replace(/^https:\/\//,'').replace(/\/$/,'');
 const audience=String(env.ACCESS_AUD||'').trim();
 const emails=String(env.ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(!/^[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/i.test(domain)||!audience||!emails.length||emails.some(x=>!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)))return null;
 return {issuer:'https://'+domain.toLowerCase(),audience,emails};
}

export async function authenticateAccess(request,env,{resolveKey}={}) {
 const config=accessConfiguration(env);
 const token=request.headers.get('Cf-Access-Jwt-Assertion');
 if(!config||!token||token.length>16384)return null;
 try{
  let key=resolveKey;
  if(!key){
   if(!keysets.has(config.issuer)){
    if(keysets.size>=16)keysets.clear();
    keysets.set(config.issuer,createRemoteJWKSet(new URL(config.issuer+'/cdn-cgi/access/certs'),{timeoutDuration:5000,cooldownDuration:30000}));
   }
   key=keysets.get(config.issuer);
  }
  const {payload}=await jwtVerify(token,key,{issuer:config.issuer,audience:config.audience,algorithms:['RS256'],requiredClaims:['exp','iat','sub','email'],clockTolerance:5,maxTokenAge:'24h'});
  const email=typeof payload.email==='string'?payload.email.trim().toLowerCase():'';
  if(payload.type!=='app'||typeof payload.sub!=='string'||!payload.sub||payload.sub.length>240||!config.emails.includes(email))return null;
  return Object.freeze({id:payload.sub,email});
 }catch{return null;}
}

const secret=env=>typeof env.ADMIN_CSRF_SECRET==='string'&&env.ADMIN_CSRF_SECRET.length>=32?new TextEncoder().encode(env.ADMIN_CSRF_SECRET):null;
export async function issueCsrf(actor,env) {
 const key=secret(env);if(!key||!actor?.id||!env.SITE_ORIGIN)return null;
 return new SignJWT({kind:'csrf'}).setProtectedHeader({alg:'HS256',typ:'JWT'}).setIssuer(env.SITE_ORIGIN).setAudience('exactmec-admin').setSubject(actor.id).setJti(crypto.randomUUID()).setIssuedAt().setExpirationTime('15m').sign(key);
}
export async function verifyCsrf(token,actor,env) {
 const key=secret(env);if(!key||!actor?.id||typeof token!=='string'||token.length>4096)return false;
 try{const {payload}=await jwtVerify(token,key,{issuer:env.SITE_ORIGIN,audience:'exactmec-admin',algorithms:['HS256'],requiredClaims:['exp','iat','sub'],maxTokenAge:'15m'});return payload.kind==='csrf'&&payload.sub===actor.id;}catch{return false;}
}
