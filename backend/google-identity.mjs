import { createRemoteJWKSet, jwtVerify } from 'jose';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export const validGoogleClientId = value => typeof value === 'string' && /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(value);

/** Google credentials are verified on the server; browser-supplied email is never trusted. */
export async function verifyGoogleIdToken(credential, clientId) {
  const { payload } = await jwtVerify(credential, googleKeys, {
    audience: clientId,
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    algorithms: ['RS256'],
    requiredClaims: ['exp', 'iat', 'sub', 'email'],
  });
  return payload;
}

/** Google is authoritative for Gmail and verified Workspace addresses. */
export function googleEmailAuthoritative(payload, email) {
  if (payload?.email_verified !== true) return false;
  if (email.endsWith('@gmail.com')) return true;
  return typeof payload.hd === 'string' && payload.hd.toLowerCase() === email.split('@')[1];
}
