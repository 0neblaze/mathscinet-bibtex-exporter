const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("repository metadata and extension manifest share a semantic version", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "extension", "manifest.json"), "utf8"));
  assert.match(packageJson.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/);
  assert.equal(manifest.version, packageJson.version);
  assert.deepEqual(Object.keys(packageJson.scripts).sort(), ["check", "package", "test"]);
});

test("English is the default README and both language documents link to each other", () => {
  const english = fs.readFileSync(path.join(root, "README.md"), "utf8");
  const chinese = fs.readFileSync(path.join(root, "README.zh-CN.md"), "utf8");
  assert.match(english, /<p><strong>English<\/strong> \| <a href="README\.zh-CN\.md">简体中文<\/a><\/p>/);
  assert.match(chinese, /<p><a href="README\.md">English<\/a> \| <strong>简体中文<\/strong><\/p>/);
  assert.match(english, /Latest Release/);
  assert.match(chinese, /最新版本/);
});

test("language switcher and badges stay inside each centered README hero", () => {
  for (const readme of ["README.md", "README.zh-CN.md"]) {
    const source = fs.readFileSync(path.join(root, readme), "utf8");
    const hero = source.match(/^<div align="center">[\s\S]*?<\/div>/)?.[0] || "";
    assert.match(hero, /README(?:\.zh-CN)?\.md/);
    assert.match(hero, /img\.shields\.io\/github\/v\/release/);
    assert.match(hero, /actions\/workflows\/ci\.yml\/badge\.svg/);
    assert.match(hero, /License|许可证/);
    assert.match(hero, /Manifest%20V3/);
    assert.match(hero, /href="https:\/\/github\.com\/0neblaze\/mathscinet-bibtex-exporter\/releases\/latest"/);
    assert.match(hero, /href="https:\/\/github\.com\/0neblaze\/mathscinet-bibtex-exporter\/actions\/workflows\/ci\.yml"/);
    assert.match(hero, /href="LICENSE"/);
    assert.equal([...hero.matchAll(/<img\b/g)].length, 5, `${readme} icon plus four badges`);
  }
});

test("runtime, tests, and GitHub automation use dedicated directories", () => {
  for (const relativePath of [
    "extension/content.js",
    "extension/i18n.js",
    "extension/popup.html",
    "tests/content.test.cjs",
    ".github/workflows/ci.yml",
    ".github/workflows/release.yml",
  ]) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), true, relativePath);
  }
  for (const oldRootFile of ["content.js", "i18n.js", "popup.html", "content.test.cjs"]) {
    assert.equal(fs.existsSync(path.join(root, oldRootFile)), false, oldRootFile);
  }
});

test("both README files reference existing local resources", () => {
  for (const readme of ["README.md", "README.zh-CN.md"]) {
    const source = fs.readFileSync(path.join(root, readme), "utf8");
    const markdownTargets = [...source.matchAll(/\]\((?!https?:|#)([^)]+)\)/g)].map((match) => match[1]);
    const htmlTargets = [...source.matchAll(/\bsrc="(?!https?:)([^"]+)"/g)].map((match) => match[1]);
    const htmlLinks = [...source.matchAll(/\bhref="(?!https?:|#)([^"]+)"/g)].map((match) => match[1]);
    for (const target of [...markdownTargets, ...htmlTargets, ...htmlLinks]) {
      assert.equal(fs.existsSync(path.join(root, target)), true, `${readme}: ${target}`);
    }
  }
});
