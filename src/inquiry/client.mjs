import { isReference } from './model.mjs';

export function sameOriginEndpoint(endpoint, origin = globalThis.location?.origin) {
  try {
    if (!origin || typeof endpoint !== 'string' || !endpoint.trim()) return null;
    const base = new URL(origin);
    const url = new URL(endpoint, base);
    if (!['http:', 'https:'].includes(base.protocol) || url.origin !== base.origin || url.username || url.password || url.search || url.hash) return null;
    return url.href;
  } catch { return null; }
}

export function createInquiryClient({ endpoint = '/api/inquiries', submitEnabled = false, origin = globalThis.location?.origin, fetchImpl = globalThis.fetch, timeoutMs = 15000, createId = () => globalThis.crypto.randomUUID() } = {}) {
  let previousBody;
  let idempotencyKey;
  let inFlight;
  return {
    submit(payload, files = []) {
      const url = sameOriginEndpoint(endpoint, origin);
      if (submitEnabled !== true || !url || typeof fetchImpl !== 'function') return Promise.resolve({ state: 'unavailable' });
      // Synchronous guard protects against two submits before React renders busy state.
      if (inFlight) return inFlight;
      let body;
      try { body = JSON.stringify(payload); }
      catch { return Promise.resolve({ state: 'unavailable' }); }
      if (typeof body !== 'string') return Promise.resolve({ state: 'unavailable' });
      const signatures=Array.isArray(files)?files.map(file=>`${file.name}\u0000${file.size}\u0000${file.lastModified}`).join('\u0001'):'';
      const identity=body+'\u0002'+signatures;
      try { if (identity !== previousBody) { idempotencyKey = createId(); previousBody = identity; } }
      catch { return Promise.resolve({ state: 'unavailable' }); }
      if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) return Promise.resolve({ state: 'unavailable' });
      const controller = new AbortController();
      let timer;
      const request = (async () => {
        try {
          const multipart=Array.isArray(files)&&files.length>0;
          const form=multipart?new FormData():null;
          if(form){form.append('payload',body);for(const file of files)form.append('files',file,file.name);}
          const response = await fetchImpl(url, { method: 'POST', headers: { ...(multipart?{}:{'Content-Type':'application/json'}), 'Idempotency-Key': idempotencyKey }, body:form||body, signal: controller.signal, credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' });
          if (response.status === 429) {
            const seconds = Number(response.headers?.get('Retry-After'));
            return { state: 'rate_limit', retryAfter: Number.isFinite(seconds) && seconds > 0 ? Math.min(Math.ceil(seconds), 3600) : null };
          }
          if (response.status === 422) {
            let data; try { data = await response.json(); } catch { /* Generic validation remains available. */ }
            const fields = data?.errors && typeof data.errors === 'object' && !Array.isArray(data.errors) ? Object.keys(data.errors) : [];
            return { state: 'invalid', fields };
          }
          if (response.status === 413) return { state:'invalid', fields:['files'] };
          // A transport failure may follow a database save; never report it as unsaved.
          if (response.status >= 500 || response.status === 408) return { state: 'pending' };
          if (![200, 201, 409].includes(response.status)) return { state: response.ok ? 'pending' : 'failed' };
          let data; try { data = await response.json(); } catch { return { state: 'pending' }; }
          if (data?.saved === true && isReference(data.reference) && (response.status !== 409 || data.status === 'duplicate')) return { state: data.status === 'duplicate' ? 'duplicate' : 'saved', reference: data.reference };
          return { state: 'pending' };
        } catch { return { state: 'pending' }; }
      })();
      const timeout = new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve({ state: 'pending' }); }, Math.max(1, files.length ? Math.max(timeoutMs,60000) : timeoutMs)); });
      inFlight = Promise.race([request, timeout]).finally(() => { clearTimeout(timer); inFlight = null; });
      return inFlight;
    }
  };
}
