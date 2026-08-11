const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const packageScript = path.join(root, "scripts", "package-release.sh");
const asset = path.join(root, "dist", "mathscinet-bibtex-exporter-v0.3.0.zip");

test("release package is installable from its root and matches the manifest version", () => {
  execFileSync(packageScript, ["0.3.0"], { cwd: root, stdio: "pipe" });

  const files = execFileSync("unzip", ["-Z1", asset], { encoding: "utf8" })
    .trim()
    .split("\n")
    .sort();
  assert.deepEqual(files, [
    "CHANGELOG.md",
    "LICENSE",
    "README.md",
    "_locales/en/messages.json",
    "_locales/zh_CN/messages.json",
    "content.js",
    "i18n.js",
    "icons/icon-128.png",
    "icons/icon-16.png",
    "icons/icon-32.png",
    "icons/icon-48.png",
    "lib.js",
    "manifest.json",
    "popup.css",
    "popup.html",
    "popup.js",
  ]);

  const archivedManifest = JSON.parse(execFileSync("unzip", ["-p", asset, "manifest.json"], { encoding: "utf8" }));
  assert.equal(archivedManifest.version, "0.3.0");

  execFileSync("shasum", ["-a", "256", "-c", `${asset}.sha256`], {
    cwd: path.dirname(asset),
    stdio: "pipe",
  });

  const firstPackage = fs.readFileSync(asset);
  const readme = path.join(root, "README.md");
  const originalTimes = fs.statSync(readme);
  const changedTime = new Date(originalTimes.mtimeMs + 60000);
  fs.utimesSync(readme, originalTimes.atime, changedTime);
  try {
    execFileSync(packageScript, ["0.3.0"], { cwd: root, stdio: "pipe" });
    assert.deepEqual(fs.readFileSync(asset), firstPackage);
  } finally {
    fs.utimesSync(readme, originalTimes.atime, originalTimes.mtime);
  }
});

test("release packaging rejects a version that differs from manifest.json", () => {
  const result = spawnSync(packageScript, ["9.9.9"], { cwd: root, encoding: "utf8" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Version mismatch/);
});
