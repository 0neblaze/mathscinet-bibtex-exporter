(function exposeMathSciNetExportLib(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MathSciNetExportLib = api;
})(typeof globalThis === "object" ? globalThis : this, function buildLibrary() {
  "use strict";

  const ENTRY_START = /@[a-zA-Z]+\s*[({]\s*[^,\s]+\s*,/g;
  const RESULT_NUMBER = String.raw`(?:\d{1,3}(?:[,\s]\d{3})+|\d+)`;

  function resultNumber(value) {
    return Number(String(value).replace(/[,\s]/g, ""));
  }

  function parseResultCount(text) {
    const source = String(text || "");
    const rangePatterns = [
      new RegExp(
        String.raw`(?:showing\s+)?${RESULT_NUMBER}\s*[–-]\s*${RESULT_NUMBER}\s+(?:results?\s+)?of\s+(${RESULT_NUMBER})`,
        "i",
      ),
      new RegExp(
        String.raw`results?\s+${RESULT_NUMBER}\s*[–-]\s*${RESULT_NUMBER}\s+of\s+(${RESULT_NUMBER})`,
        "i",
      ),
    ];
    for (const pattern of rangePatterns) {
      const match = source.match(pattern);
      if (match) return resultNumber(match[1]);
    }

    const leadingPattern = new RegExp(String.raw`(${RESULT_NUMBER})\s+(?:search\s+)?results?\b`, "gi");
    const counts = [...source.matchAll(leadingPattern)].map((match) => resultNumber(match[1]));
    return counts.length ? Math.max(...counts) : null;
  }

  function splitBibtexEntries(text) {
    const source = String(text || "").replaceAll("\r\n", "\n");
    const starts = [];
    let match;
    ENTRY_START.lastIndex = 0;
    while ((match = ENTRY_START.exec(source)) !== null) starts.push(match.index);

    return starts
      .map((start, index) => {
        const fallbackEnd = starts[index + 1] ?? source.length;
        const openingIndex = source.slice(start, fallbackEnd).search(/[({]/);
        if (openingIndex < 0) return "";

        const opening = source[start + openingIndex];
        const closing = opening === "{" ? "}" : ")";
        let depth = 0;
        for (let cursor = start + openingIndex; cursor < fallbackEnd; cursor += 1) {
          const character = source[cursor];
          const escaped = cursor > 0 && source[cursor - 1] === "\\";
          if (escaped) continue;
          if (character === opening) depth += 1;
          if (character === closing) depth -= 1;
          if (depth === 0) return source.slice(start, cursor + 1).trim();
        }
        return source.slice(start, fallbackEnd).trim();
      })
      .filter(Boolean);
  }

  function citationKey(entry) {
    const match = String(entry).match(/^@[a-zA-Z]+\s*[({]\s*([^,\s]+)\s*,/);
    return match ? match[1].toLowerCase() : null;
  }

  function dedupeBibtex(textOrEntries) {
    const entries = Array.isArray(textOrEntries)
      ? textOrEntries.flatMap(splitBibtexEntries)
      : splitBibtexEntries(textOrEntries);
    const seen = new Set();
    const unique = [];

    for (const entry of entries) {
      const key = citationKey(entry);
      const identity = key || entry;
      if (seen.has(identity)) continue;
      seen.add(identity);
      unique.push(entry);
    }

    return {
      entries: unique,
      text: unique.length ? `${unique.join("\n\n")}\n` : "",
      duplicateCount: entries.length - unique.length,
    };
  }

  function sanitizeFilename(value) {
    const clean = String(value || "mathscinet")
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120);
    return clean || "mathscinet";
  }

  function extractBibtexFromText(text) {
    return dedupeBibtex(text).text;
  }

  return {
    citationKey,
    dedupeBibtex,
    extractBibtexFromText,
    parseResultCount,
    sanitizeFilename,
    splitBibtexEntries,
  };
});
