import test from 'node:test';
import assert from 'node:assert/strict';
import {adminApiPath,adminPagePath} from '../src/admin/api-path.mjs';

test('Google management view uses its own protected routes while the Access view remains unchanged', () => {
  assert.equal(adminApiPath('/api/admin/session'), '/api/admin/session');
  globalThis.window = {location: {pathname: '/manage/leads/'}};
  try {
    assert.equal(adminApiPath('/api/admin/session'), '/api/manage/session');
    assert.equal(adminPagePath('/admin/content/home/preview/'), '/manage/content/home/preview/');
    assert.equal(adminPagePath('/admin/leads/REFERENCE/'), '/manage/leads/REFERENCE/');
  } finally { delete globalThis.window; }
});
