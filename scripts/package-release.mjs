import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = path.join(root, "extension");
const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, "manifest.json"), "utf8"));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const requestedVersion = process.argv[2] || manifest.version;

const runtimeFiles = [
  "manifest.json",
  "i18n.js",
  "lib.js",
  "content.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "_locales/en/messages.json",
  "_locales/zh_CN/messages.json",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrcTable() {
  return Array.from({ length: 256 }, (_value, index) => {
    let entry = index;
    for (let bit = 0; bit < 8; bit += 1) {
      entry = entry & 1 ? 0xedb88320 ^ (entry >>> 1) : entry >>> 1;
    }
    return entry >>> 0;
  });
}

const CRC_TABLE = buildCrcTable();
const DOS_TIME = 0;
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;

function localHeader(entry) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(DOS_TIME, 10);
  header.writeUInt16LE(DOS_DATE, 12);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(entry.data.length, 18);
  header.writeUInt32LE(entry.data.length, 22);
  header.writeUInt16LE(entry.name.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function centralHeader(entry) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(0x031e, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(DOS_TIME, 12);
  header.writeUInt16LE(DOS_DATE, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.data.length, 20);
  header.writeUInt32LE(entry.data.length, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  header.writeUInt32LE(entry.offset, 42);
  return header;
}

function createZip(files) {
  const localParts = [];
  let offset = 0;
  const entries = files.map(({ archivePath, sourcePath }) => {
    const name = Buffer.from(archivePath, "utf8");
    const data = fs.readFileSync(sourcePath);
    const entry = { crc: crc32(data), data, name, offset };
    const header = localHeader(entry);
    localParts.push(header, name, data);
    offset += header.length + name.length + data.length;
    return entry;
  });

  const centralParts = [];
  let centralSize = 0;
  for (const entry of entries) {
    const header = centralHeader(entry);
    centralParts.push(header, entry.name);
    centralSize += header.length + entry.name.length;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function packageRelease() {
  if (requestedVersion !== manifest.version || packageJson.version !== manifest.version) {
    throw new Error(
      `Version mismatch: requested ${requestedVersion}, package.json ${packageJson.version}, manifest.json ${manifest.version}`,
    );
  }

  const prefix = `mathscinet-bibtex-exporter-v${requestedVersion}`;
  const dist = path.join(root, "dist");
  fs.mkdirSync(dist, { recursive: true });
  for (const filename of fs.readdirSync(dist)) {
    if (/^mathscinet-bibtex-exporter-v.*\.zip(?:\.sha256)?$/.test(filename)) {
      fs.rmSync(path.join(dist, filename));
    }
  }

  const files = [
    ...runtimeFiles.map((relativePath) => ({
      archivePath: `${prefix}/${relativePath}`,
      sourcePath: path.join(extensionRoot, relativePath),
    })),
    { archivePath: `${prefix}/LICENSE`, sourcePath: path.join(root, "LICENSE") },
  ].sort((left, right) => (left.archivePath < right.archivePath ? -1 : left.archivePath > right.archivePath ? 1 : 0));

  const archive = createZip(files);
  const assetName = `${prefix}.zip`;
  const assetPath = path.join(dist, assetName);
  const checksumPath = `${assetPath}.sha256`;
  fs.writeFileSync(assetPath, archive);
  const checksum = crypto.createHash("sha256").update(archive).digest("hex");
  fs.writeFileSync(checksumPath, `${checksum}  ${assetName}\n`, "utf8");
  process.stdout.write(`Created ${assetPath}\nCreated ${checksumPath}\n`);
}

try {
  packageRelease();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
