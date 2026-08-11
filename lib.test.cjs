const test = require("node:test");
const assert = require("node:assert/strict");
const {
  citationKey,
  dedupeBibtex,
  extractBibtexFromText,
  parseResultCount,
  sanitizeFilename,
  splitBibtexEntries,
} = require("./lib.js");

const ENTRY_A = `@article{MR1234567,
  author = {Doe, Jane},
  title = {A title with {nested braces}},
  year = {2025}
}`;
const ENTRY_B = `@book{MR7654321,
  author = {Roe, Richard},
  title = {Another title},
  year = {2024}
}`;

test("parses MathSciNet result counts", () => {
  assert.equal(parseResultCount("1,071 results"), 1071);
  assert.equal(parseResultCount("9 search results"), 9);
  assert.equal(parseResultCount("Results 1–100 of 1,071"), 1071);
  assert.equal(parseResultCount("Showing 1-100 results of 1,071"), 1071);
  assert.equal(parseResultCount("100 results per page; 1,071 results"), 1071);
  assert.equal(parseResultCount("1 071 results"), 1071);
  assert.equal(parseResultCount("No matches"), null);
});

test("splits and keys BibTeX records", () => {
  const entries = splitBibtexEntries(`Copy these citations\n${ENTRY_A}\n\n${ENTRY_B}\nDone`);
  assert.equal(entries.length, 2);
  assert.equal(citationKey(entries[0]), "mr1234567");
  assert.equal(citationKey(entries[1]), "mr7654321");
  assert.equal(entries[1].endsWith("}"), true);
});

test("deduplicates repeated records by citation key", () => {
  const result = dedupeBibtex(`${ENTRY_A}\n${ENTRY_B}\n${ENTRY_A}`);
  assert.equal(result.entries.length, 2);
  assert.equal(result.duplicateCount, 1);
  assert.match(result.text, /MR1234567/);
  assert.match(result.text, /MR7654321/);
});

test("extracts BibTeX from surrounding interface text", () => {
  assert.equal(extractBibtexFromText(`Copy\n${ENTRY_A}\nDone`).startsWith("@article"), true);
});

test("creates safe filenames", () => {
  assert.equal(sanitizeFilename("MathSciNet F / 1,071 results.bib"), "MathSciNet_F_1_071_results.bib");
});
