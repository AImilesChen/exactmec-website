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

const sampleData={drawing_status:'A physical sample'};

test('default review form prioritizes aluminum molds and drawings, with sample and discreet no-drawings routes', () => {
  const html = renderToStaticMarkup(React.createElement(Inquiry));
  assert.match(html, /Design preview · No information is sent/);
  assert.match(html, /Aluminum die casting mold<\/strong><small>Our main tooling service/);
  assert.match(html, /Injection mold<\/strong><small>Project review available/);
  assert.match(html, /Upload your product drawings/);
  assert.match(html, /3D preferred: <strong>STEP \/ STP/);
  assert.match(html,/I have a physical sample/);
  assert.match(html,/class="rfq-concept-link"[^>]*>No drawings or sample/);
  assert.match(html,/class="rfq-after-submit"/);
  assert.ok(html.indexOf('rfq-after-submit') > html.indexOf('</form>'));
  assert.match(html,/type="file"/);
  assert.doesNotMatch(html, /type="submit"|wa\.me/);
});

test('details step retains all screening fields and separate contact choices', () => {
  const html = renderToStaticMarkup(React.createElement(Inquiry,{initialData:sampleData}));
  for (const name of ['name', 'company', 'email', 'phone', 'country', 'city', 'component', 'description', 'drawing_status', 'mold_sets']) {
    if(name==='drawing_status')continue;
    const control = html.match(new RegExp(`<(?:input|select|textarea)[^>]*name="${name}"[^>]*>`))?.[0];
    assert.ok(control, name);
    assert.match(control, /required=""/, name);
  }
  const whatsapp = html.match(/<input[^>]*id="whatsapp"[^>]*>/)?.[0];
  assert.ok(whatsapp);
  assert.doesNotMatch(whatsapp, /required|checked/);
  assert.match(html,/Physical sample · shipping details to be discussed/);
  assert.doesNotMatch(html, /type="file"|type="password"|wa\.me/);
});

test('production mode remains unavailable until parent explicitly enables collection', () => {
  const html = renderToStaticMarkup(React.createElement(Inquiry, { reviewMode: false,initialData:sampleData }));
  assert.match(html, /Online submission is not available yet/);
  assert.match(html, /<button[^>]*type="submit"[^>]*disabled=""/);
  assert.match(html, /class="button primary submit is-unavailable"/);
  assert.match(html, />Online submission unavailable<\/button>/);
  assert.doesNotMatch(html, /Your Inquiry Has Been Received|Your reference is/);
});

test('an enabled inquiry form retains the submission action without the unavailable state', () => {
  const html = renderToStaticMarkup(React.createElement(Inquiry, { reviewMode: false, submitEnabled: true,initialData:sampleData }));
  const button = html.match(/<button[^>]*type="submit"[^>]*>/)?.[0];
  assert.ok(button);
  assert.doesNotMatch(button, /disabled|is-unavailable/);
  assert.match(html, /Send My Mold Inquiry/);
  assert.doesNotMatch(html, /Online submission unavailable/);
});

test('enabling the form does not enable an untrusted or parameterized endpoint', () => {
  for (const endpoint of ['https://untrusted.example/api/inquiries', '//untrusted.example/api/inquiries', '/api/inquiries?email=private']) {
    const html = renderToStaticMarkup(React.createElement(Inquiry, { reviewMode: false, submitEnabled: true, endpoint,initialData:sampleData }));
    assert.match(html, /<button[^>]*type="submit"[^>]*disabled=""/);
    assert.match(html, />Online submission unavailable<\/button>/);
  }
});

test('closed public form offers configured manual WhatsApp contact before the fields', () => {
  const html = renderToStaticMarkup(React.createElement(Inquiry, { reviewMode: false, whatsappNumber: '+8615990661727' }));
  assert.match(html, /href="https:\/\/wa\.me\/8615990661727"/);
  assert.match(html, /Contact us on WhatsApp about your mold project/);
  assert.ok(html.indexOf('https://wa.me/8615990661727') < html.indexOf('Upload your product drawings'));
  assert.doesNotMatch(html, /wa\.me\/8615990661727\?/);
  assert.match(html, /Online submission is not available yet/);
});

test('configured WhatsApp does not turn a review form into live contact or invoke an event', () => {
  let called = false;
  const html = renderToStaticMarkup(React.createElement(Inquiry, { whatsappNumber: '+8615990661727', onEvent: () => { called = true; } }));
  assert.doesNotMatch(html, /wa\.me/);
  assert.equal(called, false);
});
