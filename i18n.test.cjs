const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_SETTINGS,
  DICTIONARIES,
  SETTINGS_KEY,
  createTranslator,
  resolveLanguage,
} = require("./i18n.js");

test("language settings use a separate stable storage key and default to auto", () => {
  assert.equal(SETTINGS_KEY, "mathscinetBibtexExporterSettingsV1");
  assert.deepEqual(DEFAULT_SETTINGS, { language: "auto" });
});

test("auto follows Simplified Chinese browser locales and otherwise uses English", () => {
  assert.equal(resolveLanguage("auto", "zh-CN"), "zh-CN");
  assert.equal(resolveLanguage("auto", "zh-Hans-CN"), "zh-CN");
  assert.equal(resolveLanguage("auto", "en-GB"), "en");
  assert.equal(resolveLanguage("auto", "fr-FR"), "en");
});

test("manual language overrides the browser locale", () => {
  assert.equal(resolveLanguage("zh-CN", "en-US"), "zh-CN");
  assert.equal(resolveLanguage("en", "zh-CN"), "en");
});

test("Chinese and English dictionaries expose exactly the same non-empty keys", () => {
  const chineseKeys = Object.keys(DICTIONARIES["zh-CN"]).sort();
  const englishKeys = Object.keys(DICTIONARIES.en).sort();
  assert.deepEqual(chineseKeys, englishKeys);
  for (const language of ["zh-CN", "en"]) {
    for (const [key, value] of Object.entries(DICTIONARIES[language])) {
      assert.equal(typeof value, "string", `${language}.${key}`);
      assert.notEqual(value.trim(), "", `${language}.${key}`);
    }
  }
});

test("translator interpolates parameters and fails fast for missing keys or values", () => {
  const english = createTranslator({ language: "en", uiLanguage: "zh-CN" });
  assert.equal(english.t("progress.summary", { page: 2, pages: 11, count: 200 }), "2/11 pages · 200 records");
  assert.throws(() => english.t("missing.translation"), /Missing translation/);
  assert.throws(() => english.t("progress.summary", { page: 2 }), /Missing interpolation value/);
});
