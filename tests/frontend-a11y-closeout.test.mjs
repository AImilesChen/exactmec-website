import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';

async function component(relative, name) {
  const compiled = await build({ entryPoints: [fileURLToPath(new URL(relative, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react'], logLevel: 'silent' });
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), loaded, loaded.exports);
  return loaded.exports[name];
}
const ProductFigure = await component('../src/EditorialPages.jsx', 'ProductFigure');
const PhaseExplorer = await component('../src/PhaseExplorer.jsx', 'PhaseExplorer');

test('actual first-screen product image is eager/high while ordinary figures retain lazy loading', () => {
  const hero = renderToStaticMarkup(React.createElement(ProductFigure, { priority: true }));
  const regular = renderToStaticMarkup(React.createElement(ProductFigure));
  assert.match(hero, /<img[^>]*loading="eager"[^>]*fetchPriority="high"/i);
  assert.doesNotMatch(hero, /<img[^>]*loading="lazy"/);
  assert.match(regular, /<img[^>]*loading="lazy"/);
  assert.doesNotMatch(regular, /fetchPriority="high"/i);
});

test('actual project-stage tabset exposes a single tab stop and a matching labelled panel', () => {
  const html = renderToStaticMarkup(React.createElement(PhaseExplorer));
  const tabs = [...html.matchAll(/<button\b[^>]*role="tab"[^>]*>/g)].map(match => match[0]);
  assert.equal(tabs.length, 5);
  assert.equal(tabs.filter(tab => /tabindex="0"/i.test(tab)).length, 1);
  assert.equal(tabs.filter(tab => /tabindex="-1"/i.test(tab)).length, 4);
  const active = tabs.find(tab => /aria-selected="true"/.test(tab));
  assert.match(active, /tabindex="0"/i);
  const id = active.match(/id="([^"]+)"/)[1];
  const panel = html.match(/<div\b[^>]*role="tabpanel"[^>]*>/)[0];
  assert.ok(panel.includes('aria-labelledby="' + id + '"'));
  const panelId = panel.match(/id="([^"]+)"/)[1];
  assert.ok(tabs.every(tab => tab.includes('aria-controls="' + panelId + '"')));
});
