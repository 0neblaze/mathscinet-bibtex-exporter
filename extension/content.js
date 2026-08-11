(function exposeMathSciNetExporter(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = { createExporter: factory };
    return;
  }

  if (root.__mathSciNetBatchExporterLoaded) return;
  const exporter = factory(root);
  root.__mathSciNetBatchExporterLoaded = true;
  root.MathSciNetBatchExporter = exporter;
  exporter.initialize();
})(typeof globalThis === "object" ? globalThis : this, function createExporter(root) {
  "use strict";

  const Blob = root.Blob;
  const chrome = root.chrome;
  const document = root.document;
  const Element = root.Element;
  const Event = root.Event;
  const getComputedStyle = root.getComputedStyle;
  const KeyboardEvent = root.KeyboardEvent;
  const location = root.location;
  const navigator = root.navigator;
  const setTimeout = root.setTimeout;
  const URL = root.URL;
  const i18n = root.MathSciNetI18n;
  const lib = root.MathSciNetExportLib;
  const STORAGE_KEY = "mathscinetBibtexBatchJobV1";
  const PAGE_ADVANCE_RESULT = Object.freeze({
    advanced: "advanced",
    navigating: "navigating",
    unavailable: "unavailable",
  });
  const state = {
    running: false,
    cancelled: false,
    entries: [],
    page: 0,
    pages: 0,
    total: 0,
    jobStatus: "idle",
    pendingPage: null,
    searchIdentity: "",
  };
  let languageSetting = i18n.DEFAULT_SETTINGS.language;
  let translator = i18n.createTranslator({
    language: languageSetting,
    uiLanguage: chrome.i18n.getUILanguage(),
  });
  let currentStatus = { key: "panel.ready", params: {} };
  let currentStatusKind = "normal";
  let storageChangeListenerRegistered = false;

  function message(key, params = {}) {
    return { key, params };
  }

  function isMessage(value) {
    return Boolean(value && typeof value === "object" && typeof value.key === "string");
  }

  function renderMessage(value) {
    if (!isMessage(value)) return String(value ?? "");
    const renderedParams = Object.fromEntries(
      Object.entries(value.params || {}).map(([key, param]) => [key, isMessage(param) ? renderMessage(param) : param]),
    );
    return translator.t(value.key, renderedParams);
  }

  function localizedError(key, params = {}) {
    const descriptor = message(key, params);
    const error = new Error(renderMessage(descriptor));
    error.localizedMessage = descriptor;
    return error;
  }

  function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  }

  function normalizedText(element) {
    return String(element?.innerText || element?.textContent || element?.getAttribute?.("aria-label") || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function visibleElements(selector) {
    return [...document.querySelectorAll(selector)].filter(isVisible);
  }

  function elementIsDisabled(element) {
    return Boolean(
      element.disabled ||
        element.getAttribute("aria-disabled") === "true" ||
        element.classList.contains("disabled"),
    );
  }

  async function waitFor(check, operation, timeout = 20000, interval = 250) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (state.cancelled) throw localizedError("error.userStopped");
      const value = await check();
      if (value) return value;
      await sleep(interval);
    }
    throw localizedError("error.timeout", { operation });
  }

  function findExactControl(labels) {
    return visibleElements("button, [role='button'], [role='menuitem'], a").find(
      (element) => !elementIsDisabled(element) && controlHasExactName(element, labels),
    );
  }

  function controlHasExactName(element, labels) {
    const wanted = labels.map((label) => label.toLowerCase());
    const values = [
      normalizedText(element),
      element.getAttribute("aria-label") || "",
      element.getAttribute("title") || "",
    ].map((value) => value.replace(/\s+/g, " ").trim().toLowerCase());
    return values.some((value) => wanted.includes(value));
  }

  function resultFingerprint() {
    const page = currentPageNumber();
    const records = visibleElements("article, [class*='result'], [class*='record']")
      .map(normalizedText)
      .filter((value) => value.length > 40)
      .slice(0, 3);
    const recordText = records.join("|");
    const mrNumbers = [...recordText.matchAll(/\bMR\s?(\d{5,})\b/g)].slice(0, 5).map((match) => match[1]);
    return `${page ?? "?"}::${mrNumbers.join("|")}::${recordText.slice(0, 800)}`;
  }

  function searchIdentity(rawUrl = location.href) {
    const url = new URL(rawUrl, location.href);
    for (const key of [...url.searchParams.keys()]) {
      if (/^(page|pagenumber|start|offset|size)$/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString();
  }

  function requestedPageNumber(rawUrl = location.href) {
    const page = Number(new URL(rawUrl, location.href).searchParams.get("page"));
    return Number.isInteger(page) && page > 0 ? page : null;
  }

  async function saveProgress(status = "running") {
    const deduped = lib.dedupeBibtex(state.entries);
    state.entries = deduped.entries;
    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        status,
        entries: state.entries,
        page: state.page,
        pages: state.pages,
        pendingPage: state.pendingPage,
        total: state.total,
        searchIdentity: state.searchIdentity,
        updatedAt: new Date().toISOString(),
      },
    });
    state.jobStatus = status;
  }

  function setStatus(statusMessage, kind = "normal") {
    currentStatus = statusMessage;
    currentStatusKind = kind;
    const status = document.querySelector("#msbe-status");
    if (status) {
      status.textContent = renderMessage(currentStatus);
      status.dataset.kind = kind;
    }
    const launcher = document.querySelector("#msbe-launcher");
    if (launcher) {
      launcher.dataset.kind = kind;
      launcher.setAttribute("title", translator.t("panel.launcherTitle", { status: renderMessage(currentStatus) }));
    }
  }

  function setButtons() {
    const start = document.querySelector("#msbe-start");
    const stop = document.querySelector("#msbe-stop");
    const partial = document.querySelector("#msbe-partial");
    if (start) start.disabled = state.running;
    if (stop) stop.disabled = !state.running;
    if (partial) partial.disabled = state.entries.length === 0;
  }

  function setProgress() {
    const progress = document.querySelector("#msbe-progress");
    if (progress) {
      progress.textContent = translator.t("progress.summary", {
        page: state.page,
        pages: state.pages || "?",
        count: state.entries.length,
      });
    }
    const progressBar = document.querySelector("#msbe-progress-bar");
    if (progressBar) {
      const percent = state.pages ? Math.min(100, Math.round((state.page / state.pages) * 100)) : 0;
      progressBar.style.width = `${percent}%`;
      progressBar.setAttribute("aria-valuenow", String(percent));
    }
    const badge = document.querySelector("#msbe-launcher-badge");
    if (badge) {
      badge.hidden = !state.pages;
      badge.textContent = state.pages ? `${state.page}/${state.pages}` : "";
    }
    setButtons();
  }

  function downloadBibtex(partial = false) {
    const result = lib.dedupeBibtex(state.entries);
    if (!result.entries.length) throw localizedError("error.noDownload");

    const date = new Date().toISOString().slice(0, 10);
    const suffix = partial ? "_partial" : "";
    const filename = lib.sanitizeFilename(`mathscinet_${date}_${result.entries.length}_records${suffix}.bib`);
    const blob = new Blob([result.text], { type: "application/x-bibtex;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.documentElement.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return { count: result.entries.length, filename };
  }

  function findPageSizeSelect() {
    return visibleElements("select").find((select) => {
      const values = [...select.options].map((option) => `${option.value} ${option.textContent}`);
      const label = `${select.name} ${select.getAttribute("aria-label") || ""}`;
      return values.some((value) => /\b100\b/.test(value)) && /page|size/i.test(label);
    });
  }

  function visibleMathSciNetRecordIds() {
    const linkedIds = visibleElements("a")
      .flatMap((link) => {
        const textMatch = normalizedText(link).match(/^MR\s?(\d{5,})$/);
        const href = link.getAttribute("href") || "";
        if (!textMatch || link.classList.contains("refmr") || !href.startsWith("/mathscinet/article?")) return [];
        const target = new URL(href, location.href);
        return target.searchParams.get("mr") === textMatch[1] ? [textMatch[1]] : [];
      });
    if (linkedIds.length) return [...new Set(linkedIds)].sort();

    const ids = [];
    for (const checkbox of visibleElements("input[type='checkbox']")) {
      const label = `${checkbox.title || ""} ${checkbox.getAttribute("aria-label") || ""}`;
      if (/select all on page/i.test(label)) continue;

      let container = checkbox.parentElement;
      for (let depth = 0; container && depth < 10; depth += 1, container = container.parentElement) {
        const matches = [
          ...new Set([...normalizedText(container).matchAll(/\bMR\s?(\d{5,})\b/g)].map((match) => match[1])),
        ];
        if (matches.length === 1) {
          ids.push(matches[0]);
          break;
        }
        if (matches.length > 1) break;
      }
    }
    return [...new Set(ids)].sort();
  }

  function visibleRecordSignature() {
    return visibleMathSciNetRecordIds().join("|");
  }

  async function waitForRecordSet({
    expectedCount,
    expectedPage = null,
    expectedRequestedPage = null,
    previousSignature = "",
    description,
  }) {
    let lastSignature = "";
    let stableSamples = 0;
    await waitFor(
      () => {
        const ids = visibleMathSciNetRecordIds();
        const signature = ids.join("|");
        if (
          ids.length !== expectedCount ||
          !signature ||
          signature === previousSignature ||
          (expectedPage !== null && currentPageNumber() !== expectedPage) ||
          (expectedRequestedPage !== null && requestedPageNumber() !== expectedRequestedPage)
        ) {
          lastSignature = "";
          stableSamples = 0;
          return false;
        }
        if (signature === lastSignature) stableSamples += 1;
        else {
          lastSignature = signature;
          stableSamples = 1;
        }
        return stableSamples >= 2;
      },
      description,
      30000,
      500,
    );
  }

  async function setPageSizeTo100() {
    const select = await waitFor(findPageSizeSelect, message("operation.waitPageSize"));
    const option = [...select.options].find((candidate) => /\b100\b/.test(`${candidate.value} ${candidate.textContent}`));
    if (!option) throw localizedError("error.noPageSize100");
    const expected = Math.min(100, state.total);
    if (select.value === option.value) {
      await waitForRecordSet({
        expectedCount: expected,
        description: message("operation.waitStableResults", { count: expected }),
      });
      return;
    }

    const before = visibleRecordSignature();
    select.value = option.value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await waitForRecordSet({
      expectedCount: expected,
      previousSignature: before,
      description: message("operation.waitPageSizeRefresh"),
    });
  }

  function currentPageControl() {
    const current = visibleElements("[aria-current]").find((element) => /^\d+$/.test(normalizedText(element)));
    if (current) return current;

    const selected = visibleElements(
      "button, [role='button'], [role='menuitem'], a, li, [class*='page']",
    ).find((element) => {
      const marker = `${String(element.className || "")} ${element.getAttribute("aria-selected") || ""}`;
      return /^\d+$/.test(normalizedText(element)) && /(active|current|selected|true)/i.test(marker);
    });
    if (!selected) return null;

    const tagName = String(selected.tagName || "").toLowerCase();
    if (tagName === "button" || tagName === "a" || selected.getAttribute("role") === "button") return selected;
    if (typeof selected.querySelector !== "function") return selected;
    const nestedControl = selected.querySelector("button, [role='button'], a");
    return nestedControl && isVisible(nestedControl) && /^\d+$/.test(normalizedText(nestedControl))
      ? nestedControl
      : selected;
  }

  function currentPageNumber() {
    const control = currentPageControl();
    return control ? Number(normalizedText(control)) : null;
  }

  function paginationContext() {
    const current = currentPageControl();
    if (!current) return null;
    const selector = "button, [role='button'], [role='menuitem'], a";
    for (let container = current.parentElement; container; container = container.parentElement) {
      if (typeof container.querySelectorAll !== "function") continue;
      const controls = [...container.querySelectorAll(selector)].filter(isVisible);
      if (!controls.includes(current)) continue;
      const hasForwardControl = controls.some(
        (control) =>
          controlHasExactName(control, ["next", "next page", "go to next page"]) ||
          Number(normalizedText(control)) === Number(normalizedText(current)) + 1,
      );
      if (hasForwardControl) return { container, controls, current };
    }
    return null;
  }

  function findPaginationControl(labels, targetPage = null) {
    const context = paginationContext();
    if (!context) return null;
    const enabledControls = context.controls.filter((control) => !elementIsDisabled(control));
    const namedControls = enabledControls.filter((control) => controlHasExactName(control, labels));
    if (namedControls.length > 1) {
      throw localizedError("error.ambiguousNamedControl", { count: namedControls.length, label: labels[0] });
    }
    if (namedControls.length === 1) return namedControls[0];
    if (targetPage === null) return null;

    const numberedControls = enabledControls.filter(
      (control) => Number(normalizedText(control)) === targetPage,
    );
    if (numberedControls.length > 1) {
      throw localizedError("error.ambiguousNumberedControl", { count: numberedControls.length, page: targetPage });
    }
    return numberedControls[0] || null;
  }

  function findDisabledPaginationControl(labels) {
    const context = paginationContext();
    if (!context) return null;
    const matches = context.controls.filter(
      (control) => elementIsDisabled(control) && controlHasExactName(control, labels),
    );
    if (matches.length > 1) {
      throw localizedError("error.ambiguousDisabledControl", { count: matches.length, label: labels[0] });
    }
    return matches[0] || null;
  }

  function findFirstPageControl() {
    return findPaginationControl(["first", "first page", "go to first page"], 1);
  }

  async function goToFirstPage() {
    if (state.pages === 1) return;
    const first = findFirstPageControl();
    const current = currentPageNumber();
    if (current === 1) return;
    if (!first || elementIsDisabled(first)) {
      throw localizedError("error.cannotVerifyFirstPage");
    }
    const beforeRecords = visibleRecordSignature();
    const pageSizeSelect = findPageSizeSelect();
    const selectedPageSize = Number(pageSizeSelect?.selectedOptions?.[0]?.value || pageSizeSelect?.value);
    if (!Number.isFinite(selectedPageSize) || selectedPageSize < 1) {
      throw localizedError("error.cannotReadPageSize");
    }
    first.click();
    await waitForRecordSet({
      expectedCount: Math.min(selectedPageSize, state.total),
      expectedPage: 1,
      previousSignature: beforeRecords,
      description: message("operation.waitFirstPage"),
    });
  }

  function findSelectAllCheckbox() {
    return visibleElements("input[type='checkbox']").find((checkbox) => {
      const label = `${checkbox.title || ""} ${checkbox.getAttribute("aria-label") || ""}`;
      return /select all on page/i.test(label);
    });
  }

  async function selectAllRecords() {
    const checkbox = await waitFor(findSelectAllCheckbox, message("operation.waitSelectAll"));
    if (!checkbox.checked) {
      checkbox.click();
      await waitFor(() => checkbox.checked, message("operation.selectAll"));
    }
  }

  function findCitationFormatSelect() {
    return visibleElements("select").find((select) =>
      [...select.options].some((option) => normalizedText(option).toLowerCase() === "bibtex"),
    );
  }

  async function openExportControls() {
    if (findCitationFormatSelect()) return;
    const exportButton = visibleElements("button, [role='button'], [role='menuitem'], a").find((element) => {
      if (elementIsDisabled(element)) return false;
      const text = normalizedText(element).toLowerCase();
      const label = String(element.getAttribute("aria-label") || "").toLowerCase();
      return text === "export" || label === "export" || /export citations?/.test(label);
    });
    if (!exportButton) throw localizedError("error.exportButtonMissing");
    exportButton.click();
    await waitFor(findCitationFormatSelect, message("operation.openExport"));
  }

  async function chooseBibtex() {
    await openExportControls();
    const select = await waitFor(findCitationFormatSelect, message("operation.waitCitationFormat"));
    const option = [...select.options].find((candidate) => normalizedText(candidate).toLowerCase() === "bibtex");
    select.value = option.value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function bibtexCandidates() {
    const candidates = [];
    for (const element of visibleElements("textarea, pre, code, [role='dialog'], [role='document'], [contenteditable='true']")) {
      const value = "value" in element ? element.value : normalizedText(element);
      const extracted = lib.extractBibtexFromText(value);
      if (extracted) candidates.push(extracted);
    }

    const bodyExtracted = lib.extractBibtexFromText(document.body.innerText || "");
    if (bodyExtracted) candidates.push(bodyExtracted);
    return candidates.sort((left, right) => right.length - left.length);
  }

  async function readClipboardBibtex() {
    try {
      const value = await navigator.clipboard.readText();
      return lib.extractBibtexFromText(value);
    } catch (error) {
      throw localizedError("error.clipboardRead", { message: error.message });
    }
  }

  async function closeCitationOutput() {
    const close = findExactControl(["close", "done", "back to results", "cancel"]);
    if (close) {
      close.click();
      await sleep(350);
      return;
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    await sleep(350);
  }

  async function generateAndExtractBibtex() {
    const before = new Set(bibtexCandidates());
    const button = await waitFor(
      () => findExactControl(["get citations"]),
      message("operation.waitGetCitations"),
    );
    button.click();

    let extracted = await waitFor(
      async () => {
        const fresh = bibtexCandidates().find((candidate) => !before.has(candidate));
        if (fresh) return fresh;

        const copy = findExactControl([
          "copy",
          "copy citations",
          "copy citations to clipboard",
          "copy to clipboard",
        ]);
        if (copy) {
          copy.click();
          await sleep(200);
          return readClipboardBibtex();
        }
        return "";
      },
      message("operation.waitBibtex"),
      25000,
      400,
    );

    extracted = lib.extractBibtexFromText(extracted);
    if (!extracted) throw localizedError("error.noBibtex");
    await closeCitationOutput();
    return extracted;
  }

  async function goToNextPage(processedPage) {
    const displayedPage = currentPageNumber();
    const requestedPage = requestedPageNumber();
    const beforePage = requestedPage === processedPage ? processedPage : displayedPage;
    if (beforePage === null || beforePage !== processedPage) {
      throw localizedError("error.beforePageMismatch", {
        processed: processedPage,
        displayed: displayedPage ?? "?",
      });
    }
    const next = findPaginationControl(["next", "next page", "go to next page"], beforePage + 1);
    if (!next || elementIsDisabled(next)) {
      const disabledNext = findDisabledPaginationControl(["next", "next page", "go to next page"]);
      if (!disabledNext || beforePage >= state.pages) return PAGE_ADVANCE_RESULT.unavailable;
      state.pendingPage = beforePage + 1;
      await saveProgress("running");
      const target = new URL(location.href);
      target.searchParams.set("page", String(state.pendingPage));
      target.searchParams.set("size", "100");
      location.assign(target.toString());
      return PAGE_ADVANCE_RESULT.navigating;
    }
    const beforeRecords = visibleRecordSignature();
    next.click();
    const expectedCount = Math.min(100, Math.max(1, state.total - beforePage * 100));
    await waitForRecordSet({
      expectedCount,
      expectedPage: beforePage + 1,
      previousSignature: beforeRecords,
      description: message("operation.waitPageRefresh", { page: beforePage + 1 }),
    });
    const afterPage = currentPageNumber();
    if (afterPage !== beforePage + 1) {
      throw localizedError("error.afterPageMismatch", { expected: beforePage + 1, actual: afterPage });
    }
    await sleep(600);
    return PAGE_ADVANCE_RESULT.advanced;
  }

  async function runExport({ resumeFromNavigation = false } = {}) {
    if (state.running) return;
    state.running = true;
    state.cancelled = false;
    const currentSearchIdentity = searchIdentity();
    const canResume =
      ["running", "error", "cancelled"].includes(state.jobStatus) &&
      state.searchIdentity === currentSearchIdentity;
    const pendingPage = state.pendingPage;
    const resumingPendingPage =
      resumeFromNavigation &&
      canResume &&
      pendingPage !== null &&
      requestedPageNumber() === pendingPage;
    if (!canResume) state.entries = [];
    state.searchIdentity = currentSearchIdentity;
    if (!resumingPendingPage) {
      state.page = 0;
      state.pendingPage = null;
    }
    setButtons();

    try {
      state.total = await waitFor(
        () => lib.parseResultCount(document.body.innerText || ""),
        message("operation.waitResultTotal"),
        30000,
        250,
      );
      state.pages = Math.ceil(state.total / 100);
      setProgress();
      let startPage = 1;
      if (resumingPendingPage) {
        startPage = pendingPage;
        const expectedCount = Math.min(100, state.total - (startPage - 1) * 100);
        setStatus(message("status.recoveringPage", { page: startPage, pages: state.pages }));
        await waitForRecordSet({
          expectedCount,
          expectedRequestedPage: startPage,
          description: message("operation.waitDirectPage", { page: startPage, count: expectedCount }),
        });
      } else {
        setStatus(message("status.detectedTotal", { total: state.total }));
        await goToFirstPage();
        await setPageSizeTo100();
      }

      for (let page = startPage; page <= state.pages; page += 1) {
        state.page = page;
        setProgress();
        setStatus(message("status.processingPage", { page, pages: state.pages }));

        await openExportControls();
        await selectAllRecords();
        await chooseBibtex();
        const pageBibtex = await generateAndExtractBibtex();
        state.entries.push(pageBibtex);
        const deduped = lib.dedupeBibtex(state.entries);
        state.entries = deduped.entries;
        if (resumingPendingPage && page === pendingPage) {
          const expectedCumulativeCount = Math.min(state.total, page * 100);
          if (state.entries.length !== expectedCumulativeCount) {
            throw localizedError("error.resumeCountMismatch", {
              page,
              expected: expectedCumulativeCount,
              actual: state.entries.length,
            });
          }
          state.pendingPage = null;
        }
        await saveProgress("running");
        setProgress();

        if (page < state.pages) {
          const advanceResult = await goToNextPage(page);
          if (advanceResult === PAGE_ADVANCE_RESULT.navigating) return;
          if (advanceResult === PAGE_ADVANCE_RESULT.unavailable) {
            throw localizedError("error.nextMissing", { page });
          }
        }
      }

      if (state.entries.length !== state.total) {
        throw localizedError("error.totalCountMismatch", {
          expected: state.total,
          actual: state.entries.length,
        });
      }
      const download = downloadBibtex(false);
      await saveProgress("complete");
      setStatus(message("status.complete", { count: download.count, filename: download.filename }), "success");
    } catch (error) {
      const errorMessage = error?.localizedMessage || (error instanceof Error ? error.message : String(error));
      const terminalStatus = state.cancelled ? "cancelled" : "error";
      state.jobStatus = terminalStatus;
      let persistenceMessage = "";
      try {
        await saveProgress(terminalStatus);
      } catch (storageError) {
        persistenceMessage = message("status.persistenceError", { message: storageError.message });
      }
      setStatus(
        message(state.cancelled ? "status.cancelled" : "status.failed", {
          message: errorMessage,
          persistence: persistenceMessage,
        }),
        "error",
      );
    } finally {
      state.running = false;
      setButtons();
    }
  }

  async function restoreProgress() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const job = stored[STORAGE_KEY];
    if (!job || !Array.isArray(job.entries) || job.status === "complete" || !job.searchIdentity) return null;
    if (job.searchIdentity !== searchIdentity()) return null;
    state.entries = job.entries;
    state.page = Number(job.page) || 0;
    state.pages = Number(job.pages) || 0;
    state.total = Number(job.total) || 0;
    state.jobStatus = job.status;
    state.pendingPage = Number(job.pendingPage) || null;
    state.searchIdentity = job.searchIdentity || searchIdentity();
    setProgress();
    setStatus(message("status.restoreFound", { count: state.entries.length }), "warning");
    return job;
  }

  function renderPanel() {
    translator = i18n.createTranslator({
      language: languageSetting,
      uiLanguage: chrome.i18n.getUILanguage(),
    });
    const panel = document.querySelector("#msbe-panel");
    if (!panel) return;
    document.querySelector("#msbe-root").setAttribute("lang", translator.language);

    document.querySelector("#msbe-title").textContent = translator.t("panel.title");
    document.querySelector("#msbe-start").textContent = translator.t("panel.exportAll");
    document.querySelector("#msbe-stop").textContent = translator.t("panel.stop");
    document.querySelector("#msbe-partial").textContent = translator.t("panel.downloadCollected");
    const collapse = document.querySelector("#msbe-collapse");
    collapse.setAttribute("aria-label", translator.t("panel.ariaCollapse"));
    collapse.setAttribute("title", translator.t("panel.collapse"));
    const launcher = document.querySelector("#msbe-launcher");
    launcher.setAttribute("aria-label", translator.t(panel.hidden ? "panel.ariaExpand" : "panel.ariaCollapse"));
    document.querySelector("#msbe-progress-bar").setAttribute("aria-label", translator.t("panel.ariaProgress"));
    setStatus(currentStatus, currentStatusKind);
    setProgress();
  }

  function registerLanguageListener() {
    if (storageChangeListenerRegistered) return;
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !Object.prototype.hasOwnProperty.call(changes, i18n.SETTINGS_KEY)) return;
      languageSetting = i18n.normalizeLanguageSetting(changes[i18n.SETTINGS_KEY].newValue?.language);
      renderPanel();
    });
    storageChangeListenerRegistered = true;
  }

  async function initialize() {
    let settingError = null;
    try {
      const stored = await chrome.storage.local.get(i18n.SETTINGS_KEY);
      languageSetting = i18n.normalizeLanguageSetting(stored[i18n.SETTINGS_KEY]?.language);
    } catch (error) {
      settingError = error;
    }
    registerLanguageListener();
    const restorePromise = mountPanel();
    if (settingError) {
      setStatus(message("status.settingReadFailed", { message: settingError.message }), "error");
    }
    return restorePromise;
  }

  function mountPanel() {
    if (document.querySelector("#msbe-root")) {
      renderPanel();
      return Promise.resolve(null);
    }
    const rootElement = document.createElement("aside");
    rootElement.id = "msbe-root";
    rootElement.innerHTML = `
      <style>
        #msbe-root,#msbe-root *{box-sizing:border-box}
        #msbe-launcher{position:fixed;right:18px;bottom:18px;z-index:2147483647;width:48px;height:48px;border:2px solid #fff;border-radius:50%;background:#0b4f9c;color:#fff;box-shadow:0 7px 22px rgba(11,79,156,.32),0 2px 7px rgba(23,50,77,.22);cursor:pointer;font:700 16px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;transition:transform .16s ease,background .16s ease,box-shadow .16s ease}
        #msbe-launcher:hover{background:#083f7d;transform:translateY(-2px);box-shadow:0 9px 25px rgba(11,79,156,.38),0 3px 8px rgba(23,50,77,.2)} #msbe-launcher:focus-visible{outline:3px solid rgba(237,107,36,.55);outline-offset:3px}
        #msbe-launcher[data-kind="success"]{background:#167744} #msbe-launcher[data-kind="error"]{background:#b42318} #msbe-launcher[data-kind="warning"]{background:#a15c00}
        #msbe-launcher-mark{display:inline-flex;align-items:baseline;gap:1px;letter-spacing:-1px} #msbe-launcher-mark strong{color:#fff;font-size:17px} #msbe-launcher-mark i{color:#ffb176;font:800 14px/1 sans-serif}
        #msbe-launcher-badge{position:absolute;right:-8px;top:-7px;min-width:27px;padding:3px 5px;border:2px solid #fff;border-radius:12px;background:#ed6b24;color:#fff;font:700 10px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums;box-shadow:0 2px 6px rgba(23,50,77,.22)}
        #msbe-launcher-badge[hidden],#msbe-panel[hidden]{display:none!important}
        #msbe-panel{position:fixed;right:18px;bottom:78px;z-index:2147483647;width:min(336px,calc(100vw - 36px));max-height:calc(100vh - 110px);overflow:auto;padding:0;border:1px solid #c8d5e2;border-radius:13px;background:#fff;color:#17324d;box-shadow:0 12px 34px rgba(23,50,77,.22);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        #msbe-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0;padding:13px 14px 10px;border-bottom:3px solid #ed6b24;background:linear-gradient(135deg,#0b4f9c,#0a417f);color:#fff}
        #msbe-panel h2{margin:0;font-size:16px;line-height:1.25;letter-spacing:-.01em}
        #msbe-collapse{flex:0 0 auto;width:28px;height:28px;border:1px solid rgba(255,255,255,.32);border-radius:7px;background:rgba(255,255,255,.1);color:#fff;cursor:pointer;font-size:21px;line-height:1}
        #msbe-collapse:hover{background:rgba(255,255,255,.2)} #msbe-collapse:focus-visible{outline:3px solid rgba(255,177,118,.7);outline-offset:2px}
        #msbe-body{padding:13px 14px 14px}
        #msbe-status{min-height:42px;margin:0 0 9px;overflow-wrap:anywhere;color:#294963}
        #msbe-status[data-kind="success"]{color:#0e6b3e} #msbe-status[data-kind="error"]{color:#b42318} #msbe-status[data-kind="warning"]{color:#8a5200}
        #msbe-progress-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 7px}
        #msbe-progress{margin:0;color:#526a81;font-size:12px;font-weight:650;font-variant-numeric:tabular-nums}
        #msbe-progress-track{height:6px;margin:0 0 12px;overflow:hidden;border-radius:99px;background:#e5edf5}
        #msbe-progress-bar{width:0;height:100%;border-radius:inherit;background:linear-gradient(90deg,#0b4f9c 0%,#1769b5 72%,#ed6b24 100%);transition:width .2s ease}
        #msbe-actions{display:grid;grid-template-columns:1fr auto;gap:7px}
        #msbe-actions button{min-height:35px;border:1px solid #0b4f9c;border-radius:8px;padding:7px 10px;background:#0b4f9c;color:#fff;cursor:pointer;font-weight:650;line-height:1.2}
        #msbe-actions button:hover:not(:disabled){background:#083f7d} #msbe-actions button:focus-visible{outline:3px solid rgba(237,107,36,.42);outline-offset:2px}
        #msbe-actions button:nth-child(n+2){background:#fff;color:#0b4f9c}
        #msbe-actions button:nth-child(n+2):hover:not(:disabled){background:#eef5fb}
        #msbe-partial{grid-column:1/-1}
        #msbe-actions button:disabled{cursor:not-allowed;opacity:.45}
      </style>
      <button id="msbe-launcher" type="button" aria-controls="msbe-panel" aria-expanded="false">
        <span id="msbe-launcher-mark" aria-hidden="true"><strong>B</strong><i>↓</i></span><span id="msbe-launcher-badge" hidden></span>
      </button>
      <section id="msbe-panel" hidden aria-labelledby="msbe-title">
        <div id="msbe-heading">
          <h2 id="msbe-title"></h2>
          <button id="msbe-collapse" type="button">×</button>
        </div>
        <div id="msbe-body">
          <p id="msbe-status" role="status" aria-live="polite"></p>
          <div id="msbe-progress-row"><p id="msbe-progress"></p></div>
          <div id="msbe-progress-track"><div id="msbe-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div></div>
          <div id="msbe-actions">
            <button id="msbe-start" type="button"></button>
            <button id="msbe-stop" type="button" disabled></button>
            <button id="msbe-partial" type="button" disabled></button>
          </div>
        </div>
      </section>`;
    document.documentElement.append(rootElement);
    renderPanel();

    const launcher = rootElement.querySelector("#msbe-launcher");
    const panel = rootElement.querySelector("#msbe-panel");
    const setPanelExpanded = (expanded) => {
      panel.hidden = !expanded;
      launcher.setAttribute("aria-expanded", String(expanded));
      launcher.setAttribute("aria-label", translator.t(expanded ? "panel.ariaCollapse" : "panel.ariaExpand"));
    };
    launcher.addEventListener("click", () => {
      setPanelExpanded(panel.hidden);
    });
    rootElement.querySelector("#msbe-collapse").addEventListener("click", () => setPanelExpanded(false));

    rootElement.querySelector("#msbe-start").addEventListener("click", () => runExport());
    rootElement.querySelector("#msbe-stop").addEventListener("click", () => {
      state.cancelled = true;
      setStatus(message("status.stopping"), "warning");
    });
    rootElement.querySelector("#msbe-partial").addEventListener("click", () => {
      try {
        const download = downloadBibtex(true);
        setStatus(message("status.partialDownloaded", { count: download.count }), "warning");
      } catch (error) {
        setStatus(error.localizedMessage || error.message, "error");
      }
    });

    return restoreProgress()
      .then((job) => {
        if (
          job &&
          ["running", "error"].includes(state.jobStatus) &&
          state.pendingPage !== null &&
          requestedPageNumber() === state.pendingPage
        ) {
          runExport({ resumeFromNavigation: true });
        }
      })
      .catch((error) => setStatus(message("status.restoreReadFailed", { message: error.message }), "error"));
  }

  return {
    getState: () => ({ ...state, entries: [...state.entries] }),
    initialize,
    mountPanel,
    runExport,
  };
});
