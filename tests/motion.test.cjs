const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("popup uses the shared corner and restrained motion system", () => {
  const css = fs.readFileSync(path.join(root, "extension", "popup.css"), "utf8");
  assert.match(css, /--msbe-radius-surface:\s*12px/);
  assert.match(css, /--msbe-motion-duration:\s*220ms/);
  assert.match(css, /--msbe-motion-ease:\s*cubic-bezier\(\.22,\s*1,\s*\.36,\s*1\)/);
  assert.match(css, /body\s*\{[^}]*width:\s*320px[^}]*padding:\s*8px[^}]*background:\s*transparent/s);
  assert.match(css, /\.card\s*\{[^}]*border-radius:\s*var\(--msbe-radius-surface\)[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.segmented::before/);
  assert.match(css, /\.segmented\[data-selected-index="2"\]::before/);
  assert.match(css, /\.feedback\s*\{[^}]*height:\s*34px[^}]*overflow:\s*auto/s);
  assert.match(
    css,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*animation:\s*none[\s\S]*\.segmented::before[\s\S]*transition-duration:\s*\.01ms/,
  );
});

test("page controls use bidirectional panel and reduced-motion styles", () => {
  const source = fs.readFileSync(path.join(root, "extension", "content.js"), "utf8");
  assert.match(source, /--msbe-radius-surface:\s*12px/);
  assert.match(source, /--msbe-motion-duration:\s*220ms/);
  assert.match(source, /#msbe-panel\[data-expanded="false"\]/);
  assert.match(source, /#msbe-panel\[data-expanded="true"\]/);
  assert.match(source, /transform-origin:\s*bottom right/);
  assert.match(source, /#msbe-launcher:active/);
  assert.match(
    source,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[^{]*\{[^}]*animation:none!important;transition-duration:\.01ms!important;transition-delay:0s!important[^}]*\}#msbe-panel\[data-expanded="false"\]\{transform:none\}#msbe-panel\[data-expanded="true"\]\{transform:none\}/,
  );
});
