const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const packageScript = path.join(root, "scripts", "package-release.mjs");
const assetName = `mathscinet-bibtex-exporter-v${version}.zip`;
const asset = path.join(root, "dist", assetName);

function runPackage(requestedVersion = version) {
  execFileSync(process.execPath, [packageScript, requestedVersion], { cwd: root, stdio: "pipe" });
}

function zipEntries(buffer) {
  const endSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const endOffset = buffer.lastIndexOf(endSignature);
  assert.notEqual(endOffset, -1, "ZIP end record");
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let cursor = buffer.readUInt32LE(endOffset + 16);
  const entries = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014b50, "central directory entry");
    const compression = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    assert.equal(compression, 0, `${name} uses deterministic store mode`);
    assert.equal(buffer.readUInt32LE(localOffset), 0x04034b50, `${name} local header`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    entries.set(name, buffer.subarray(dataOffset, dataOffset + compressedSize));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

test("release package has one installable root and matches the project version", () => {
  runPackage();

  const archive = fs.readFileSync(asset);
  const entries = zipEntries(archive);
  const prefix = `mathscinet-bibtex-exporter-v${version}/`;
  assert.deepEqual([...entries.keys()].sort(), [
    `${prefix}LICENSE`,
    `${prefix}_locales/en/messages.json`,
    `${prefix}_locales/zh_CN/messages.json`,
    `${prefix}content.js`,
    `${prefix}i18n.js`,
    `${prefix}icons/icon-128.png`,
    `${prefix}icons/icon-16.png`,
    `${prefix}icons/icon-32.png`,
    `${prefix}icons/icon-48.png`,
    `${prefix}lib.js`,
    `${prefix}manifest.json`,
    `${prefix}popup.css`,
    `${prefix}popup.html`,
    `${prefix}popup.js`,
  ]);

  const archivedManifest = JSON.parse(entries.get(`${prefix}manifest.json`).toString("utf8"));
  assert.equal(archivedManifest.version, version);

  const expectedHash = fs.readFileSync(`${asset}.sha256`, "utf8").trim().split(/\s+/)[0];
  const actualHash = crypto.createHash("sha256").update(archive).digest("hex");
  assert.equal(actualHash, expectedHash);
  assert.deepEqual(fs.readdirSync(path.join(root, "dist")).sort(), [assetName, `${assetName}.sha256`]);

  const firstPackage = Buffer.from(archive);
  const popup = path.join(root, "extension", "popup.html");
  const originalTimes = fs.statSync(popup);
  const changedTime = new Date(originalTimes.mtimeMs + 60000);
  fs.utimesSync(popup, originalTimes.atime, changedTime);
  try {
    runPackage();
    assert.deepEqual(fs.readFileSync(asset), firstPackage);
  } finally {
    fs.utimesSync(popup, originalTimes.atime, originalTimes.mtime);
  }
});

test("release packaging rejects a version that differs from project metadata", () => {
  const result = spawnSync(process.execPath, [packageScript, "9.9.9"], { cwd: root, encoding: "utf8" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Version mismatch/);
});
