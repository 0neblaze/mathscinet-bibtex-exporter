const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("manifest declares the bilingual popup without adding privileges or background pages", () => {
  assert.equal(manifest.version, "0.3.0");
  assert.equal(manifest.default_locale, "en");
  assert.equal(manifest.name, "__MSG_extensionName__");
  assert.equal(manifest.description, "__MSG_extensionDescription__");
  assert.equal(manifest.action.default_popup, "popup.html");
  assert.deepEqual(manifest.permissions, ["clipboardRead", "storage"]);
  assert.deepEqual(manifest.content_scripts[0].js, ["i18n.js", "lib.js", "content.js"]);
  assert.equal("options_page" in manifest, false);
  assert.equal("options_ui" in manifest, false);
  assert.equal("background" in manifest, false);
  assert.equal("chrome_url_overrides" in manifest, false);
});

test("manifest locale metadata has matching English and Chinese keys", () => {
  const english = JSON.parse(fs.readFileSync(path.join(root, "_locales", "en", "messages.json"), "utf8"));
  const chinese = JSON.parse(fs.readFileSync(path.join(root, "_locales", "zh_CN", "messages.json"), "utf8"));
  assert.deepEqual(Object.keys(english).sort(), Object.keys(chinese).sort());
  assert.equal(english.extensionName.message, "MathSciNet BibTeX Batch Exporter");
  assert.equal(chinese.extensionName.message, "MathSciNet BibTeX 批量导出");
});

test("every declared toolbar icon exists and is non-empty", () => {
  for (const iconPath of Object.values(manifest.icons)) {
    assert.ok(fs.statSync(path.join(root, iconPath)).size > 0, iconPath);
  }
  assert.deepEqual(manifest.action.default_icon, manifest.icons);
});

test("runtime interface copy is sourced from the shared dictionaries", () => {
  const contentScript = fs.readFileSync(path.join(root, "content.js"), "utf8");
  assert.doesNotMatch(contentScript, /[\u3400-\u9fff]/);
});
