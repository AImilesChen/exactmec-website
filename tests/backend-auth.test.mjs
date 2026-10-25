import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT} from 'jose';
import {accessConfiguration,authenticateAccess,issueCsrf,verifyCsrf} from '../backend/auth.mjs';

const env={ACCESS_TEAM_DOMAIN:'sample.cloudflareaccess.com',ACCESS_AUD:'exactmec-policy',ADMIN_EMAILS:'admin@example.com',ADMIN_CSRF_SECRET:'synthetic-secret-only-not-production-0000000000',SITE_ORIGIN:'https://exactmec.com'};
const {privateKey,publicKey}=await generateKeyPair('RS256');
const token=async({email='admin@example.com',issuer='https://sample.cloudflareaccess.com',audience='exactmec-policy',exp='1h',type='app'}={})=>new SignJWT({email,type}).setProtectedHeader({alg:'RS256',kid:'test'}).setSubject('synthetic-user').setIssuedAt().setIssuer(issuer).setAudience(audience).setExpirationTime(exp).sign(privateKey);
const req=t=>new Request('https://exactmec.com/api/admin/session',{headers:{'Cf-Access-Jwt-Assertion':t}});

test('admin access is closed without issuer/audience/allowlist and rejects spoofed identity headers',async()=>{
 assert.equal(accessConfiguration({}),null);assert.equal(accessConfiguration({...env,ACCESS_TEAM_DOMAIN:'sample.cloudflareaccess.com.evil.invalid'}),null);
 assert.equal(await authenticateAccess(new Request('https://exactmec.com/api/admin/session',{headers:{'Cf-Access-Authenticated-User-Email':'admin@example.com'}}),env),null);
 assert.equal(await authenticateAccess(req(await token()),{}),null);
});
test('verified Access app JWT must match signature, issuer, audience, time and named administrator',async()=>{
 const actor=await authenticateAccess(req(await token()),env,{resolveKey:publicKey});assert.deepEqual(actor,{id:'synthetic-user',email:'admin@example.com'});
 for(const values of [{email:'other@example.com'},{issuer:'https://other.cloudflareaccess.com'},{audience:'another-policy'},{exp:'-1m'},{type:'org'}])assert.equal(await authenticateAccess(req(await token(values)),env,{resolveKey:publicKey}),null);
 const altered=(await token()).split('.');altered[2]=altered[2].slice(0,-4)+'AAAA';assert.equal(await authenticateAccess(req(altered.join('.')),env,{resolveKey:publicKey}),null);
});
test('CSRF tokens are signed, short lived, actor/origin scoped and have no weak default secret',async()=>{
 const actor={id:'synthetic-user',email:'admin@example.com'};const signed=await issueCsrf(actor,env);assert.ok(signed);
 assert.equal(await verifyCsrf(signed,actor,env),true);assert.equal(await verifyCsrf(signed,{id:'another-user'},env),false);
 assert.equal(await verifyCsrf(signed,actor,{...env,SITE_ORIGIN:'https://other.invalid'}),false);
 assert.equal(await verifyCsrf(signed+'x',actor,env),false);assert.equal(await issueCsrf(actor,{...env,ADMIN_CSRF_SECRET:''}),null);
});
