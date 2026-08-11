const test = require("node:test");
const assert = require("node:assert/strict");

const lib = require("./lib.js");
const i18n = require("./i18n.js");
const { createExporter } = require("./content.js");

class FakeElement {
  constructor(tagName, text = "", attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.innerText = text;
    this.textContent = text;
    this.attributes = { ...attributes };
    this.className = "";
    this.classList = { contains: () => false };
    this.disabled = false;
    this.checked = false;
    this.dataset = {};
    this.hidden = false;
    this.listeners = new Map();
    this.options = [];
    this.parentElement = null;
    this.style = {};
    this.childrenById = new Map();
    if (["INPUT", "SELECT", "TEXTAREA"].includes(this.tagName)) this.value = "";
    this.clickCount = 0;
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.childrenById.clear();
    const pattern = /<(button|div|h2|p|section|span)\b([^>]*)\bid="([^"]+)"([^>]*)>/gi;
    let match;
    while ((match = pattern.exec(value)) !== null) {
      const attributesText = `${match[2]} ${match[4]}`;
      const attributes = {};
      for (const attribute of attributesText.matchAll(/([\w-]+)="([^"]*)"/g)) {
        attributes[attribute[1]] = attribute[2];
      }
      const child = new FakeElement(match[1], "", attributes);
      child.id = match[3];
      child.disabled = /\bdisabled\b/i.test(attributesText);
      child.hidden = /\bhidden\b/i.test(attributesText);
      child.parentElement = this;
      this.childrenById.set(child.id, child);
    }
  }

  get innerHTML() {
    return this._innerHTML || "";
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  append(child) {
    child.parentElement = this;
  }

  click() {
    this.clickCount += 1;
    for (const listener of this.listeners.get("click") || []) listener({ target: this });
  }

  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) || []) listener(event);
    return true;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  querySelector(selector) {
    return selector.startsWith("#") ? this.childrenById.get(selector.slice(1)) || null : null;
  }

  querySelectorAll() {
    return [...this.childrenById.values()];
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getClientRects() {
    return [{}];
  }

  remove() {}
}

function option(value, text) {
  return { value, textContent: text, innerText: text };
}

function createRoot(document, storage, { uiLanguage = "en-US" } = {}) {
  const storageListeners = [];
  const location = {
    assignedUrl: null,
    href: "https://mathscinet.ams.org/mathscinet/publications-search?query=example&page=1&size=100",
    assign(url) {
      this.assignedUrl = url;
      this.href = url;
    },
  };
  return {
    Blob,
    Element: FakeElement,
    Event,
    KeyboardEvent: class KeyboardEvent {
      constructor(type, init) {
        this.type = type;
        Object.assign(this, init);
      }
    },
    MathSciNetExportLib: lib,
    MathSciNetI18n: i18n,
    URL,
    chrome: {
      i18n: { getUILanguage: () => uiLanguage },
      storage: {
        local: {
          async get(key) {
            return { [key]: storage[key] };
          },
          async set(value) {
            Object.assign(storage, value);
          },
        },
        onChanged: {
          addListener(listener) {
            storageListeners.push(listener);
          },
        },
      },
    },
    document,
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    location,
    navigator: { clipboard: { async readText() { return ""; } } },
    setTimeout(callback, delay) {
      const timer = setTimeout(callback, delay);
      if (delay >= 30000) timer.unref();
      return timer;
    },
    __storageListeners: storageListeners,
  };
}

function createOnePageScenario({
  citationCount,
  displayedPage = 1,
  includeRelatedMr = false,
  initiallyOpen = false,
  pageUrl = null,
  recordStartId = 1234567,
  resultCount = 1,
  sharedStorage = null,
  totalDelayMs = 0,
  totalCount = resultCount,
} = {}) {
  let exportOpen = initiallyOpen;
  let citationOutput = "";
  const downloads = [];
  const mountedElements = new Map();
  const storage = sharedStorage || {};
  const exportedCount = citationCount ?? resultCount;

  const pageSize = new FakeElement("select", "", { "aria-label": "Results per page" });
  pageSize.options = [option("20", "20"), option("100", "100")];
  pageSize.value = "100";
  pageSize.selectedOptions = [pageSize.options[1]];

  const citationFormat = new FakeElement("select");
  citationFormat.options = [option("bibtex", "BibTeX")];
  citationFormat.value = "bibtex";

  const recordLinks = Array.from({ length: resultCount }, (_, index) => {
    const id = recordStartId + index;
    return new FakeElement("a", `MR${id}`, { href: `/mathscinet/article?mr=${id}` });
  });
  const relatedMrLink = new FakeElement("a", "Discussion [MR7654321]", {
    href: "/mathscinet/article?mr=7654321",
  });
  const recordCards = recordLinks.map(
    (record) => new FakeElement("article", `${record.innerText} with enough text to identify this record`),
  );
  const currentPage = new FakeElement("button", String(displayedPage), { "aria-current": "page" });
  const cardoneAuthor = new FakeElement("a", "Cardone, Martina");
  const selectAll = new FakeElement("input", "", { "aria-label": "Select all on page" });
  selectAll.addEventListener("click", () => {
    selectAll.checked = true;
  });

  const exportButton = new FakeElement("button", "Export", { "aria-label": "Export" });
  exportButton.addEventListener("click", () => {
    exportOpen = true;
  });

  const getCitations = new FakeElement("button", "Get Citations");
  getCitations.addEventListener("click", () => {
    citationOutput = recordLinks
      .slice(0, exportedCount)
      .map((record) => `@article{${record.innerText.split(" - ")[0]},\n  title = {Example result}\n}`)
      .join("\n\n");
  });

  const document = {
    body: {
      innerText: totalDelayMs ? "" : `${totalCount} result${totalCount === 1 ? "" : "s"}`,
    },
    documentElement: {
      append(element) {
        if (element.tagName === "A" && element.download) downloads.push(element.download);
        if (element.id) mountedElements.set(element.id, element);
        for (const child of element.childrenById.values()) mountedElements.set(child.id, child);
      },
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    dispatchEvent() {},
    querySelector(selector) {
      return selector.startsWith("#") ? mountedElements.get(selector.slice(1)) || null : null;
    },
    querySelectorAll(selector) {
      if (selector === "select") return exportOpen ? [pageSize, citationFormat] : [pageSize];
      if (selector === "a" || selector === "a[data-record-id], a[href*='MR'], a") {
        return includeRelatedMr ? [...recordLinks, relatedMrLink] : recordLinks;
      }
      if (selector === "article, [class*='result'], [class*='record']") return recordCards;
      if (selector === "[aria-current]") return [currentPage];
      if (selector === "input[type='checkbox']") return exportOpen ? [selectAll] : [];
      if (selector === "textarea, pre, code, [role='dialog'], [role='document'], [contenteditable='true']") {
        return citationOutput ? [new FakeElement("pre", citationOutput)] : [];
      }
      if (selector === "button, [role='button'], [role='menuitem'], a") {
        return exportOpen
          ? [exportButton, getCitations, cardoneAuthor, currentPage]
          : [exportButton, cardoneAuthor, currentPage];
      }
      return [];
    },
  };

  const root = createRoot(document, storage);
  if (pageUrl) root.location.href = pageUrl;
  if (totalDelayMs) {
    setTimeout(() => {
      document.body.innerText = `${totalCount} result${totalCount === 1 ? "" : "s"}`;
    }, totalDelayMs);
  }

  return { cardoneAuthor, downloads, exportButton, root, selectAll, storage };
}

function createThreePageScenario({ disableNextOnPage = null, duplicatePagerNext = false, includePagerNext = true } = {}) {
  let currentPageNumber = 1;
  let exportOpen = false;
  let citationOutput = "";
  const downloads = [];
  const storage = {};
  const pageCounts = [100, 100, 1];

  const pageSize = new FakeElement("select", "", { "aria-label": "Results per page" });
  pageSize.options = [option("20", "20"), option("100", "100")];
  pageSize.value = "100";
  pageSize.selectedOptions = [pageSize.options[1]];

  const citationFormat = new FakeElement("select");
  citationFormat.options = [option("bibtex", "BibTeX")];
  citationFormat.value = "bibtex";

  const currentPage = new FakeElement("button", "1", { "aria-label": "Go to page 1" });
  const pager = new FakeElement("nav", "", { "aria-label": "Search results pagination" });
  const currentPageItem = new FakeElement("li", "1");
  currentPageItem.className = "page-item active";
  currentPageItem.parentElement = pager;
  currentPageItem.querySelector = () => currentPage;
  currentPage.parentElement = currentPageItem;

  const advance = () => {
    currentPageNumber += 1;
    currentPage.innerText = String(currentPageNumber);
    currentPage.textContent = String(currentPageNumber);
    currentPage.setAttribute("aria-label", `Go to page ${currentPageNumber}`);
    currentPageItem.innerText = String(currentPageNumber);
    currentPageItem.textContent = String(currentPageNumber);
    if (currentPageNumber === disableNextOnPage) pagerNext.setAttribute("aria-disabled", "true");
    citationOutput = "";
    selectAll.checked = false;
  };

  const wrongNext = new FakeElement("button", "Next", { "aria-label": "Next record preview" });
  wrongNext.addEventListener("click", advance);
  const pagerNext = new FakeElement("button", "Next", { "aria-label": "Go to next page" });
  pagerNext.parentElement = pager;
  pagerNext.addEventListener("click", advance);
  const secondPagerNext = new FakeElement("button", "Next", { "aria-label": "Go to next page" });
  secondPagerNext.parentElement = pager;
  secondPagerNext.addEventListener("click", advance);
  pager.querySelectorAll = () => {
    if (!includePagerNext) return [currentPage];
    return duplicatePagerNext ? [currentPage, pagerNext, secondPagerNext] : [currentPage, pagerNext];
  };

  const selectAll = new FakeElement("input", "", { "aria-label": "Select all on page" });
  selectAll.addEventListener("click", () => {
    selectAll.checked = true;
  });

  const exportButton = new FakeElement("button", "Export", { "aria-label": "Export" });
  exportButton.addEventListener("click", () => {
    exportOpen = true;
  });

  const recordsForCurrentPage = () => {
    const start = (currentPageNumber - 1) * 100 + 1;
    return Array.from({ length: pageCounts[currentPageNumber - 1] }, (_, index) => {
      const id = String(1000000 + start + index);
      return new FakeElement("a", `MR${id}`, { href: `/mathscinet/article?mr=${id}` });
    });
  };

  const getCitations = new FakeElement("button", "Get Citations");
  getCitations.addEventListener("click", () => {
    citationOutput = recordsForCurrentPage()
      .map((record) => `@article{${record.innerText.split(" - ")[0]},\n  title = {Example}\n}`)
      .join("\n\n");
  });

  const document = {
    body: { innerText: "201 results" },
    documentElement: {
      append(element) {
        if (element.tagName === "A" && element.download) downloads.push(element.download);
      },
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    dispatchEvent(event) {
      if (event.key === "Escape") citationOutput = "";
    },
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "select") return exportOpen ? [pageSize, citationFormat] : [pageSize];
      if (selector === "a" || selector === "a[data-record-id], a[href*='MR'], a") return recordsForCurrentPage();
      if (selector === "article, [class*='result'], [class*='record']") return recordsForCurrentPage();
      if (selector === "[aria-current]") return [];
      if (selector === "button, [role='button'], [role='menuitem'], a, li, [class*='page']") {
        return [currentPageItem, currentPage, pagerNext];
      }
      if (selector === "input[type='checkbox']") return exportOpen ? [selectAll] : [];
      if (selector === "textarea, pre, code, [role='dialog'], [role='document'], [contenteditable='true']") {
        return citationOutput ? [new FakeElement("pre", citationOutput)] : [];
      }
      if (selector === "button, [role='button'], [role='menuitem'], a") {
        const pageControls = [wrongNext, pagerNext, ...(duplicatePagerNext ? [secondPagerNext] : []), currentPage];
        return exportOpen ? [exportButton, getCitations, ...pageControls] : [exportButton, ...pageControls];
      }
      return [];
    },
  };

  const root = createRoot(document, storage);

  return { downloads, pagerNext, root, secondPagerNext, storage, wrongNext };
}

function createUiScenario({ savedLanguage, uiLanguage = "en-US" } = {}) {
  const elements = new Map();
  const storage = savedLanguage ? { [i18n.SETTINGS_KEY]: { language: savedLanguage } } : {};
  const document = {
    body: { innerText: "" },
    documentElement: {
      append(element) {
        if (element.id) elements.set(element.id, element);
        for (const child of element.childrenById.values()) elements.set(child.id, child);
      },
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    dispatchEvent() {},
    querySelector(selector) {
      return selector.startsWith("#") ? elements.get(selector.slice(1)) || null : null;
    },
    querySelectorAll() {
      return [];
    },
  };
  const root = createRoot(document, storage, { uiLanguage });
  return { document, root, storage };
}

test("starting an export opens MathSciNet's closed Export controls and collects the visible records", async () => {
  const scenario = createOnePageScenario();
  const exporter = createExporter(scenario.root);

  await exporter.runExport();

  assert.equal(scenario.exportButton.clickCount, 1);
  assert.equal(scenario.selectAll.checked, true);
  assert.deepEqual(scenario.downloads, ["mathscinet_" + new Date().toISOString().slice(0, 10) + "_1_records.bib"]);
  assert.equal(scenario.storage.mathscinetBibtexBatchJobV1.status, "complete");
});

test("starting an export leaves MathSciNet's already-open Export controls open", async () => {
  const scenario = createOnePageScenario({ initiallyOpen: true });
  const exporter = createExporter(scenario.root);

  await exporter.runExport();

  assert.equal(scenario.exportButton.clickCount, 0);
  assert.equal(scenario.selectAll.checked, true);
  assert.equal(scenario.storage.mathscinetBibtexBatchJobV1.status, "complete");
});

test("closing citation output never treats an author name containing 'done' as a Done control", async () => {
  const scenario = createOnePageScenario();
  const exporter = createExporter(scenario.root);

  await exporter.runExport();

  assert.equal(scenario.cardoneAuthor.clickCount, 0);
  assert.equal(scenario.storage.mathscinetBibtexBatchJobV1.status, "complete");
});

test("related MR links do not inflate the visible search-result count", async () => {
  const scenario = createOnePageScenario({ includeRelatedMr: true });
  const exporter = createExporter(scenario.root);

  await exporter.runExport();

  assert.equal(scenario.storage.mathscinetBibtexBatchJobV1.status, "complete");
  assert.equal(scenario.storage.mathscinetBibtexBatchJobV1.entries.length, 1);
});

test("an incomplete citation response fails the total-count check and preserves its partial records", async () => {
  const scenario = createOnePageScenario({ citationCount: 1, resultCount: 2 });
  const exporter = createExporter(scenario.root);

  await exporter.runExport();

  assert.equal(scenario.storage.mathscinetBibtexBatchJobV1.status, "error");
  assert.equal(scenario.storage.mathscinetBibtexBatchJobV1.entries.length, 1);
  assert.deepEqual(scenario.downloads, []);
});

test("multi-page export clicks Next inside the active results paginator", async () => {
  const scenario = createThreePageScenario();
  const exporter = createExporter(scenario.root);

  await exporter.runExport();

  assert.equal(scenario.wrongNext.clickCount, 0);
  assert.equal(scenario.pagerNext.clickCount, 2);
  assert.deepEqual(scenario.downloads, ["mathscinet_" + new Date().toISOString().slice(0, 10) + "_201_records.bib"]);
  assert.equal(scenario.storage.mathscinetBibtexBatchJobV1.status, "complete");
});

test("ambiguous pagination stops without clicking another Next and preserves collected records", async () => {
  const scenario = createThreePageScenario({ includePagerNext: false });
  const exporter = createExporter(scenario.root);

  await exporter.runExport();

  assert.equal(scenario.wrongNext.clickCount, 0);
  assert.equal(scenario.pagerNext.clickCount, 0);
  assert.equal(scenario.storage.mathscinetBibtexBatchJobV1.status, "error");
  assert.equal(scenario.storage.mathscinetBibtexBatchJobV1.entries.length, 100);
  assert.deepEqual(scenario.downloads, []);
});

test("multiple Next controls inside one paginator are treated as ambiguous", async () => {
  const scenario = createThreePageScenario({ duplicatePagerNext: true });
  const exporter = createExporter(scenario.root);

  await exporter.runExport();

  assert.equal(scenario.pagerNext.clickCount, 0);
  assert.equal(scenario.secondPagerNext.clickCount, 0);
  assert.equal(scenario.storage.mathscinetBibtexBatchJobV1.status, "error");
  assert.equal(scenario.storage.mathscinetBibtexBatchJobV1.entries.length, 100);
});

test("a disabled final Next with remaining results navigates directly to the pending page", async () => {
  const scenario = createThreePageScenario({ disableNextOnPage: 2 });
  const exporter = createExporter(scenario.root);

  await exporter.runExport();

  assert.match(scenario.root.location.assignedUrl || "", /[?&]page=3(?:&|$)/);
  assert.equal(scenario.storage.mathscinetBibtexBatchJobV1.status, "running");
  assert.equal(scenario.storage.mathscinetBibtexBatchJobV1.pendingPage, 3);
  assert.equal(scenario.storage.mathscinetBibtexBatchJobV1.entries.length, 200);
});

test("a directly requested pending page resumes automatically and completes the export", async () => {
  const firstContext = createThreePageScenario({ disableNextOnPage: 2 });
  firstContext.root.location.href = firstContext.root.location.href.replace("size=100", "size=20");
  await createExporter(firstContext.root).runExport();
  const resumedContext = createOnePageScenario({
    displayedPage: 2,
    pageUrl: firstContext.root.location.assignedUrl,
    resultCount: 1,
    sharedStorage: firstContext.storage,
    totalDelayMs: 100,
    totalCount: 201,
  });

  createExporter(resumedContext.root).mountPanel();
  const deadline = Date.now() + 3000;
  while (resumedContext.storage.mathscinetBibtexBatchJobV1.status !== "complete" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  assert.equal(resumedContext.storage.mathscinetBibtexBatchJobV1.status, "complete");
  assert.equal(resumedContext.storage.mathscinetBibtexBatchJobV1.pendingPage, null);
  assert.equal(resumedContext.storage.mathscinetBibtexBatchJobV1.entries.length, 201);
  assert.deepEqual(resumedContext.downloads, [
    "mathscinet_" + new Date().toISOString().slice(0, 10) + "_201_records.bib",
  ]);
});

test("a pending direct page retries automatically after a transient resume error", async () => {
  const firstContext = createThreePageScenario({ disableNextOnPage: 2 });
  await createExporter(firstContext.root).runExport();
  firstContext.storage.mathscinetBibtexBatchJobV1.status = "error";
  const resumedContext = createOnePageScenario({
    displayedPage: 2,
    pageUrl: firstContext.root.location.assignedUrl,
    resultCount: 1,
    sharedStorage: firstContext.storage,
    totalCount: 201,
  });

  createExporter(resumedContext.root).mountPanel();
  const deadline = Date.now() + 3000;
  while (resumedContext.storage.mathscinetBibtexBatchJobV1.status !== "complete" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  assert.equal(resumedContext.storage.mathscinetBibtexBatchJobV1.status, "complete");
  assert.equal(resumedContext.storage.mathscinetBibtexBatchJobV1.entries.length, 201);
});

test("a pending direct page keeps its retry marker when its records fail cumulative validation", async () => {
  const firstContext = createThreePageScenario({ disableNextOnPage: 2 });
  await createExporter(firstContext.root).runExport();
  const resumedContext = createOnePageScenario({
    displayedPage: 2,
    pageUrl: firstContext.root.location.assignedUrl,
    recordStartId: 1000001,
    resultCount: 1,
    sharedStorage: firstContext.storage,
    totalCount: 201,
  });

  createExporter(resumedContext.root).mountPanel();
  const deadline = Date.now() + 3000;
  while (resumedContext.storage.mathscinetBibtexBatchJobV1.status === "running" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  assert.equal(resumedContext.storage.mathscinetBibtexBatchJobV1.status, "error");
  assert.equal(resumedContext.storage.mathscinetBibtexBatchJobV1.pendingPage, 3);
  assert.equal(resumedContext.storage.mathscinetBibtexBatchJobV1.entries.length, 200);
});

test("the exporter mounts as a collapsed floating button and toggles its panel", () => {
  const scenario = createUiScenario();
  const exporter = createExporter(scenario.root);

  exporter.mountPanel();

  const launcher = scenario.document.querySelector("#msbe-launcher");
  const panel = scenario.document.querySelector("#msbe-panel");
  const collapse = scenario.document.querySelector("#msbe-collapse");
  assert.ok(launcher);
  assert.ok(panel);
  assert.equal(panel.hidden, true);
  assert.equal(launcher.getAttribute("aria-expanded"), "false");

  launcher.click();
  assert.equal(panel.hidden, false);
  assert.equal(launcher.getAttribute("aria-expanded"), "true");

  collapse.click();
  assert.equal(panel.hidden, true);
  assert.equal(launcher.getAttribute("aria-expanded"), "false");
});

test("the panel follows the browser language by default and restores a manual override", async () => {
  const automatic = createUiScenario({ uiLanguage: "zh-CN" });
  await createExporter(automatic.root).initialize();
  assert.equal(automatic.document.querySelector("#msbe-title").textContent, "MathSciNet 批量导出");
  assert.equal(automatic.document.querySelector("#msbe-start").textContent, "全部导出");
  assert.equal(automatic.document.querySelector("#msbe-root").getAttribute("lang"), "zh-CN");

  const manual = createUiScenario({ savedLanguage: "en", uiLanguage: "zh-CN" });
  await createExporter(manual.root).initialize();
  assert.equal(manual.document.querySelector("#msbe-title").textContent, "MathSciNet Batch Export");
  assert.equal(manual.document.querySelector("#msbe-start").textContent, "Export all");
});

test("changing the language rerenders a completed status without resetting task state", async () => {
  const scenario = createOnePageScenario();
  scenario.storage[i18n.SETTINGS_KEY] = { language: "en" };
  const exporter = createExporter(scenario.root);
  await exporter.initialize();
  await exporter.runExport();

  const before = exporter.getState();
  assert.match(scenario.root.document.querySelector("#msbe-status").textContent, /^Complete:/);
  for (const listener of scenario.root.__storageListeners) {
    listener({ [i18n.SETTINGS_KEY]: { newValue: { language: "zh-CN" } } }, "local");
  }

  const after = exporter.getState();
  assert.match(scenario.root.document.querySelector("#msbe-status").textContent, /^完成：/);
  assert.deepEqual(after, before);
});

test("changing the language rerenders an error with its parameters and preserves partial records", async () => {
  const scenario = createOnePageScenario({ citationCount: 1, resultCount: 2 });
  scenario.storage[i18n.SETTINGS_KEY] = { language: "en" };
  const exporter = createExporter(scenario.root);
  await exporter.initialize();
  await exporter.runExport();

  const before = exporter.getState();
  assert.match(scenario.root.document.querySelector("#msbe-status").textContent, /^Failed:/);
  assert.equal(before.entries.length, 1);
  for (const listener of scenario.root.__storageListeners) {
    listener({ [i18n.SETTINGS_KEY]: { newValue: { language: "zh-CN" } } }, "local");
  }

  assert.match(scenario.root.document.querySelector("#msbe-status").textContent, /^失败：/);
  assert.deepEqual(exporter.getState(), before);
});

test("deleting the language setting returns an open panel to Auto without resetting task state", async () => {
  const scenario = createUiScenario({ savedLanguage: "en", uiLanguage: "zh-CN" });
  const exporter = createExporter(scenario.root);
  await exporter.initialize();
  const before = exporter.getState();

  for (const listener of scenario.root.__storageListeners) {
    listener({ [i18n.SETTINGS_KEY]: { oldValue: { language: "en" } } }, "local");
  }

  assert.equal(scenario.document.querySelector("#msbe-title").textContent, "MathSciNet 批量导出");
  assert.deepEqual(exporter.getState(), before);
});
