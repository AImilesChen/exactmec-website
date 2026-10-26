import { budgetOptions, defaultFilters, drawingOptions, isReference, reviewOptions, timingOptions } from './model.mjs';
import { isContentId, isSourceHash, validateContentPatch } from './content-model.mjs';

const messages = Object.freeze({
  auth_required: '登录已失效，请重新验证访问权限。', forbidden: '当前账户没有访问权限。', csrf: '安全凭据已失效，请重新验证后再操作。',
  unavailable: '服务暂不可用，请稍后手动重试。', conflict: '此记录已被其他操作更新。请重新载入后核对，尚未覆盖现有资料。',
  invalid: '请检查输入内容后重试。', not_found: '记录已不存在或不可访问。', network: '连接失败，结果尚未确认。请检查网络并重新载入。',
  timeout: '请求超时，结果尚未确认。请重新载入核对后再操作。', invalid_response: '服务返回了无法确认的结果，请重新载入核对。',
  rate_limit: '操作过于频繁，请稍后重试。', failed: '操作未完成，请重新载入核对后再操作。',
  source_conflict: '源文案已经更新，请重新载入并对照当前源文案审阅草稿，再保存。此草稿尚不能导出。',
  path_conflict: '此路径已经用于另一页面。请换一个路径，并重新载入核对。',
  invalid_links: '页面中有无效链接。请检查关联页面、卡片和按钮：目标页面及锚点必须存在，目标不能已撤回。草稿仍保留，可以修改后再发布。',
});

export class AdminApiError extends Error {
  constructor(kind, status = 0) { super(messages[kind] || messages.failed); this.name = 'AdminApiError'; this.kind = kind; this.status = status; }
}

function invalid() { throw new AdminApiError('invalid'); }
function filters(input = {}) {
  const clean = defaultFilters();
  if (input.search != null && (typeof input.search !== 'string' || input.search.length > 120)) invalid();
  clean.search = (input.search || '').trim();
  for (const key of ['status', 'authenticity', 'fit', 'readiness', 'qualification', 'priority']) {
    const value = input[key] || '';
    if (value && !reviewOptions[key].includes(value)) invalid();
    clean[key] = value;
  }
  if (input.drawing_status && !drawingOptions.includes(input.drawing_status)) invalid();
  clean.drawing_status = (input.drawing_status || '').trim();
  for (const [key, options] of [['purchase_timing', timingOptions], ['budget_status', budgetOptions]]) {
    const value = input[key] ?? '';
    if (typeof value !== 'string' || value && !options.includes(value) && value !== '__not_provided__') invalid();
    clean[key] = value;
  }
  for (const [key, fallback, max] of [['page', 1, 10000], ['pageSize', 25, 100]]) {
    const value = input[key] ?? fallback;
    if (!Number.isInteger(value) || value < 1 || value > max) invalid();
    clean[key] = value;
  }
  return clean;
}

function revision(value) { if (!Number.isSafeInteger(value) || value < 1) invalid(); return value; }
function referencePath(value) { if (!isReference(value)) invalid(); return `/api/admin/leads/${encodeURIComponent(value)}`; }
function boundedText(value, max) { if (typeof value !== 'string' || value.length > max) invalid(); return value.trim(); }
function safeReview(input) {
  if (!input || typeof input !== 'object') invalid();
  const clean = {};
  for (const [key, options] of Object.entries(reviewOptions)) {
    if (input[key] != null) { if (!options.includes(input[key])) invalid(); clean[key] = input[key]; }
  }
  if (input.owner != null) clean.owner = boundedText(input.owner, 120);
  if (input.next_follow_up != null) {
    const value = boundedText(input.next_follow_up, 10);
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) invalid();
    clean.next_follow_up = value;
  }
  return clean;
}

/** All credentials and records stay in caller memory. No URL search terms, logging or storage. */
export function createAdminClient({ fetchImpl = globalThis.fetch?.bind(globalThis), timeoutMs = 15000 } = {}) {
  let csrfToken = null;
  let destroyed = false;
  const active = new Set();

  async function request(path, { method = 'GET', body, csv = false, jsonFile = false, session = false } = {}) {
    if (destroyed || typeof fetchImpl !== 'function') throw new AdminApiError('unavailable');
    if (method !== 'GET' && !csrfToken) throw new AdminApiError('csrf', 403);
    const controller = new AbortController();
    active.add(controller);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { Accept: csv ? 'text/csv' : 'application/json' };
      if (method !== 'GET') { headers['Content-Type'] = 'application/json'; headers['X-CSRF-Token'] = csrfToken; }
      const response = await fetchImpl(path, {
        method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal,
      });
      if (!response.ok) {
        let code = '';
        // Read only a fixed error code; never expose server messages or response bodies.
        if (response.headers.get('content-type')?.includes('application/json')) {
          try { const data = await response.json(); code = typeof data?.error === 'string' ? data.error : typeof data?.code === 'string' ? data.code : ''; } catch { /* Generic safe error. */ }
        }
        const kind = response.status === 401 ? 'auth_required' : response.status === 403 ? (/csrf/i.test(code) ? 'csrf' : 'forbidden')
          : response.status === 409 ? (code === 'source_conflict' ? 'source_conflict' : code === 'path_conflict' ? 'path_conflict' : 'conflict') : response.status === 404 ? 'not_found'
          : response.status === 422 || response.status === 400 ? (code === 'invalid_links' ? 'invalid_links' : 'invalid') : response.status === 429 ? 'rate_limit'
          : response.status === 503 ? 'unavailable' : 'failed';
        if (['auth_required', 'forbidden', 'csrf'].includes(kind)) csrfToken = null;
        throw new AdminApiError(kind, response.status);
      }
      if (response.status === 204) return null;
      if (csv || jsonFile) {
        if (!response.headers.get('content-type')?.includes(csv ? 'text/csv' : 'application/json')) throw new AdminApiError('invalid_response');
        return await response.blob();
      }
      if (!response.headers.get('content-type')?.includes('application/json')) throw new AdminApiError('invalid_response');
      const data = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new AdminApiError('invalid_response');
      if (session) {
        if (typeof data.user?.email !== 'string' || typeof data.csrfToken !== 'string' || !data.csrfToken || data.csrfToken.length > 2048) throw new AdminApiError('invalid_response');
        if (destroyed) throw new AdminApiError('unavailable');
        csrfToken = data.csrfToken;
        return { user: { email: data.user.email }, localSynthetic: data.localSynthetic === true };
      }
      return data;
    } catch (error) {
      if (error instanceof AdminApiError) throw error;
      throw new AdminApiError(controller.signal.aborted ? 'timeout' : error instanceof SyntaxError ? 'invalid_response' : 'network');
    } finally {
      clearTimeout(timer);
      active.delete(controller);
    }
  }

  const leadResult = data => { if (!data?.lead || !isReference(data.lead.reference) || !Number.isSafeInteger(data.lead.revision) || data.lead.revision < 1) throw new AdminApiError('invalid_response'); return data.lead; };
  const contentPath = id => { if (!isContentId(id)) invalid(); return `/api/admin/content/${id}`; };
  const contentResult = data => {
    if (!data?.page || !isContentId(data.page.id) || !Number.isSafeInteger(data.revision) || data.revision < 0 || !isSourceHash(data.sourceHash) || typeof data.stale !== 'boolean' || (data.draft !== null && !validateContentPatch(data.draft))) throw new AdminApiError('invalid_response');
    return data;
  };
  return Object.freeze({
    async session() { csrfToken = null; return request('/api/admin/session', { session: true }); },
    async search(input) {
      const data = await request('/api/admin/leads/search', { method: 'POST', body: filters(input) });
      if (!Array.isArray(data.items) || !Number.isSafeInteger(data.total) || data.total < 0 || !Number.isInteger(data.page) || !Number.isInteger(data.pageSize) || data.items.some(item => !isReference(item.reference))) throw new AdminApiError('invalid_response');
      return data;
    },
    async get(reference) { return leadResult(await request(referencePath(reference))); },
    async update(reference, input) {
      return leadResult(await request(referencePath(reference), { method: 'PATCH', body: { revision: revision(input?.revision), review: safeReview(input?.review), note: boundedText(input?.note ?? '', 4000) } }));
    },
    async optOut(reference, input) {
      if (!['whatsapp', 'all'].includes(input?.channel)) invalid();
      return leadResult(await request(`${referencePath(reference)}/opt-out`, { method: 'POST', body: { revision: revision(input.revision), channel: input.channel, reason: boundedText(input.reason ?? '', 2000) } }));
    },
    async retryNotification(reference) {
      const data = await request(`${referencePath(reference)}/retry-notification`, { method: 'POST', body: {} });
      if (!data?.notification || typeof data.notification.state !== 'string') throw new AdminApiError('invalid_response');
      return data.notification;
    },
    export(input) { return request('/api/admin/leads/export', { method: 'POST', body: filters(input), csv: true }); },
    async delete(reference, input) {
      if (input?.confirmation !== reference) invalid();
      const result = await request(referencePath(reference), { method: 'DELETE', body: { revision: revision(input.revision), confirmation: reference } });
      if (result !== null) throw new AdminApiError('invalid_response');
    },
    async listContent() {
      const data = await request('/api/admin/content');
      if (!Array.isArray(data.items) || data.items.some(item => !isContentId(item.id) || typeof item.path !== 'string' || typeof item.title !== 'string')) throw new AdminApiError('invalid_response');
      return data.items;
    },
    async getContent(id) { return contentResult(await request(contentPath(id))); },
    async saveContent(id, input) {
      const path = contentPath(id);
      const patch = validateContentPatch(input?.patch);
      if (!Number.isSafeInteger(input?.revision) || input.revision < 0 || !isSourceHash(input.sourceHash) || !patch) invalid();
      const body = { revision: input.revision, sourceHash: input.sourceHash, patch };
      if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 65536) invalid();
      return contentResult(await request(path, { method: 'PATCH', body }));
    },
    exportContent(id, input) {
      const path = contentPath(id);
      if (!isSourceHash(input?.sourceHash)) invalid();
      return request(`${path}/export`, { method: 'POST', body: { sourceHash: input.sourceHash }, jsonFile: true });
    },
    async previewContent(id, input) {
      if (!isSourceHash(input?.sourceHash) || !Number.isSafeInteger(input?.revision) || input.revision < 0) invalid();
      const data = await request(`${contentPath(id)}/preview`, { method: 'POST', body: { sourceHash: input.sourceHash, revision: input.revision } });
      if (!data?.page || data.page.id !== id || data.preview !== true) throw new AdminApiError('invalid_response');
      return data;
    },
    async publishContent(id, input) {
      if (!isSourceHash(input?.sourceHash) || !Number.isSafeInteger(input?.revision) || input.revision < 1 || !Number.isSafeInteger(input?.publicationRevision) || input.publicationRevision < 0) invalid();
      return contentResult(await request(`${contentPath(id)}/publish`, { method: 'POST', body: { sourceHash: input.sourceHash, revision: input.revision, publicationRevision: input.publicationRevision } }));
    },
    async withdrawContent(id, input) {
      if (!isSourceHash(input?.sourceHash) || !Number.isSafeInteger(input?.revision) || input.revision < 1 || !Number.isSafeInteger(input?.publicationRevision) || input.publicationRevision < 1) invalid();
      return contentResult(await request(`${contentPath(id)}/withdraw`, { method: 'POST', body: { sourceHash: input.sourceHash, revision: input.revision, publicationRevision: input.publicationRevision } }));
    },
    async getContentSettings() { return request('/api/admin/content-settings'); },
    async saveContentSettings(input) {
      if (!Number.isSafeInteger(input?.revision) || input.revision < 0 || !input.settings) invalid();
      return request('/api/admin/content-settings', { method: 'PATCH', body: { revision: input.revision, settings: input.settings } });
    },
    destroy() { destroyed = true; csrfToken = null; for (const controller of active) controller.abort(); active.clear(); },
  });
}
