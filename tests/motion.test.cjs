const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("popup fills the native window with stable bilingual geometry", () => {
  const css = fs.readFileSync(path.join(root, "extension", "popup.css"), "utf8");
  const popupSource = fs.readFileSync(path.join(root, "extension", "popup.js"), "utf8");
  assert.match(css, /--msbe-radius-surface:\s*12px/);
  assert.match(css, /--msbe-motion-duration:\s*220ms/);
  assert.match(css, /--msbe-motion-ease:\s*cubic-bezier\(\.22,\s*1,\s*\.36,\s*1\)/);
  assert.match(
    css,
    /body\s*\{[^}]*width:\s*320px[^}]*height:\s*354px[^}]*padding:\s*0[^}]*background:\s*linear-gradient/s,
  );
  assert.match(
    css,
    /\.card\s*\{[^}]*display:\s*grid[^}]*height:\s*354px[^}]*grid-template-rows:\s*62px\s+54px\s+136px\s+34px[^}]*gap:\s*12px[^}]*padding:\s*16px/s,
  );
  assert.doesNotMatch(css, /\.card\s*\{[^}]*(?:border-radius|box-shadow):/s);
  assert.match(css, /h1\s*\{[^}]*height:\s*38px/s);
  assert.match(css, /#popup-site-status\s*\{[^}]*inline-size:\s*158px[^}]*-webkit-line-clamp:\s*2/s);
  assert.match(css, /\.hint\s*\{[^}]*height:\s*32px/s);
  assert.match(css, /\.feedback\s*\{[^}]*height:\s*34px[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.feedback\[data-kind="error"\]\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.site-card,\s*\.language-card\s*\{[^}]*border-radius:\s*var\(--msbe-radius-surface\)/s);
  assert.match(css, /\.segmented::before/);
  assert.match(css, /\.segmented\[data-selected-index="2"\]::before/);
  assert.doesNotMatch(css, /popup-section-enter/);
  assert.doesNotMatch(css, /\.segmented button:active/);
  assert.doesNotMatch(popupSource, /animateUpdate/);
  const popupEntry = css.slice(css.indexOf("@keyframes popup-enter"), css.indexOf("@media (prefers-reduced-motion"));
  assert.doesNotMatch(popupEntry, /transform:/);
  assert.match(
    css,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.card[\s\S]*animation:\s*none[\s\S]*\.segmented::before[\s\S]*transition-duration:\s*\.01ms/,
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
