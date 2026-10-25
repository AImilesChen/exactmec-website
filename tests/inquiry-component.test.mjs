import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';

// Compile the actual JSX without emitting artifacts or introducing a DOM dependency.
const compiled = await build({ entryPoints: [fileURLToPath(new URL('../src/inquiry/Inquiry.jsx', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react'], logLevel: 'silent' });
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), loaded, loaded.exports);
const { Inquiry } = loaded.exports;

test('default review form clearly marks no transmission and keeps all required inquiry controls', () => {
  const html = renderToStaticMarkup(React.createElement(Inquiry));
  assert.match(html, /Design preview · No information is sent/);
  for (const name of ['name', 'company', 'email', 'phone', 'country', 'city', 'component', 'description', 'drawing_status', 'mold_sets']) {
    const control = html.match(new RegExp(`<(?:input|select|textarea)[^>]*name="${name}"[^>]*>`))?.[0];
    assert.ok(control, name);
    assert.match(control, /required=""/, name);
  }
  const whatsapp = html.match(/<input[^>]*id="whatsapp"[^>]*>/)?.[0];
  assert.ok(whatsapp);
  assert.doesNotMatch(whatsapp, /required|checked/);
  assert.doesNotMatch(html, /type="file"|type="password"|wa\.me/);
});

test('production mode remains unavailable until parent explicitly enables collection', () => {
  const html = renderToStaticMarkup(React.createElement(Inquiry, { reviewMode: false }));
  assert.match(html, /Online submission is not available yet/);
  assert.match(html, /<button[^>]*type="submit"[^>]*disabled=""/);
  assert.doesNotMatch(html, /Your Inquiry Has Been Received|Your reference is/);
});

test('closed public form offers configured manual WhatsApp contact before the fields', () => {
  const html = renderToStaticMarkup(React.createElement(Inquiry, { reviewMode: false, whatsappNumber: '+8615990661727' }));
  assert.match(html, /href="https:\/\/wa\.me\/8615990661727"/);
  assert.match(html, /Contact us on WhatsApp about your mold project/);
  assert.ok(html.indexOf('https://wa.me/8615990661727') < html.indexOf('id="name"'));
  assert.doesNotMatch(html, /wa\.me\/8615990661727\?/);
  assert.match(html, /<button[^>]*type="submit"[^>]*disabled=""/);
});

test('configured WhatsApp does not turn a review form into live contact or invoke an event', () => {
  let called = false;
  const html = renderToStaticMarkup(React.createElement(Inquiry, { whatsappNumber: '+8615990661727', onEvent: () => { called = true; } }));
  assert.doesNotMatch(html, /wa\.me/);
  assert.equal(called, false);
});
