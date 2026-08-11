(function exposeMathSciNetExporter(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = { createExporter: factory };
    return;
  }

  if (root.__mathSciNetBatchExporterLoaded) return;
  const exporter = factory(root);
  root.__mathSciNetBatchExporterLoaded = true;
  root.MathSciNetBatchExporter = exporter;
  exporter.mountPanel();
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

  async function waitFor(check, description, timeout = 20000, interval = 250) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (state.cancelled) throw new Error("任务已由用户停止");
      const value = await check();
      if (value) return value;
      await sleep(interval);
    }
    throw new Error(`${description}超时`);
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

  function setStatus(message, kind = "normal") {
    const status = document.querySelector("#msbe-status");
    if (status) {
      status.textContent = message;
      status.dataset.kind = kind;
    }
    const launcher = document.querySelector("#msbe-launcher");
    if (launcher) {
      launcher.dataset.kind = kind;
      launcher.setAttribute("title", `MathSciNet 批量导出：${message}`);
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
    if (progress) progress.textContent = `${state.page}/${state.pages || "?"} 页 · ${state.entries.length} 条`;
    const badge = document.querySelector("#msbe-launcher-badge");
    if (badge) {
      badge.hidden = !state.pages;
      badge.textContent = state.pages ? `${state.page}/${state.pages}` : "";
    }
    setButtons();
  }

  function downloadBibtex(partial = false) {
    const result = lib.dedupeBibtex(state.entries);
    if (!result.entries.length) throw new Error("当前还没有可下载的 BibTeX 记录");

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
    const select = await waitFor(findPageSizeSelect, "等待每页数量选项");
    const option = [...select.options].find((candidate) => /\b100\b/.test(`${candidate.value} ${candidate.textContent}`));
    if (!option) throw new Error("页面数量菜单中没有 100 条选项");
    const expected = Math.min(100, state.total);
    if (select.value === option.value) {
      await waitForRecordSet({
        expectedCount: expected,
        description: `等待结果列表稳定到 ${expected} 条`,
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
      description: `等待每页 100 条的结果列表完成刷新`,
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
      throw new Error(`分页器内找到 ${namedControls.length} 个匹配的 ${labels[0]} 控件；为防止误点，任务已停止`);
    }
    if (namedControls.length === 1) return namedControls[0];
    if (targetPage === null) return null;

    const numberedControls = enabledControls.filter(
      (control) => Number(normalizedText(control)) === targetPage,
    );
    if (numberedControls.length > 1) {
      throw new Error(`分页器内找到 ${numberedControls.length} 个第 ${targetPage} 页控件；为防止误点，任务已停止`);
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
      throw new Error(`分页器内找到 ${matches.length} 个禁用的 ${labels[0]} 控件；为防止误点，任务已停止`);
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
      throw new Error("无法明确验证当前为第 1 页；为防止漏页，任务已停止");
    }
    const beforeRecords = visibleRecordSignature();
    const pageSizeSelect = findPageSizeSelect();
    const selectedPageSize = Number(pageSizeSelect?.selectedOptions?.[0]?.value || pageSizeSelect?.value);
    if (!Number.isFinite(selectedPageSize) || selectedPageSize < 1) {
      throw new Error("无法读取当前每页记录数；为防止漏页，任务已停止");
    }
    first.click();
    await waitForRecordSet({
      expectedCount: Math.min(selectedPageSize, state.total),
      expectedPage: 1,
      previousSignature: beforeRecords,
      description: "等待第一页文献列表完成刷新",
    });
  }

  function findSelectAllCheckbox() {
    return visibleElements("input[type='checkbox']").find((checkbox) => {
      const label = `${checkbox.title || ""} ${checkbox.getAttribute("aria-label") || ""}`;
      return /select all on page/i.test(label);
    });
  }

  async function selectAllRecords() {
    const checkbox = await waitFor(findSelectAllCheckbox, "等待全选框");
    if (!checkbox.checked) {
      checkbox.click();
      await waitFor(() => checkbox.checked, "全选当前页");
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
    if (!exportButton) throw new Error("没有找到 MathSciNet 的 Export 按钮");
    exportButton.click();
    await waitFor(findCitationFormatSelect, "打开 Export 菜单");
  }

  async function chooseBibtex() {
    await openExportControls();
    const select = await waitFor(findCitationFormatSelect, "等待引用格式菜单");
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
      throw new Error(`读取剪贴板失败：${error.message}`);
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
    const button = await waitFor(() => findExactControl(["get citations"]), "等待 Get Citations 按钮");
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
      "等待 MathSciNet 生成 BibTeX",
      25000,
      400,
    );

    extracted = lib.extractBibtexFromText(extracted);
    if (!extracted) throw new Error("MathSciNet 已响应，但没有识别到 BibTeX 文本");
    await closeCitationOutput();
    return extracted;
  }

  async function goToNextPage(processedPage) {
    const displayedPage = currentPageNumber();
    const requestedPage = requestedPageNumber();
    const beforePage = requestedPage === processedPage ? processedPage : displayedPage;
    if (beforePage === null || beforePage !== processedPage) {
      throw new Error(`翻页前页码校验失败：刚处理第 ${processedPage} 页，页面显示第 ${displayedPage ?? "?"} 页`);
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
      description: `等待第 ${beforePage + 1} 页文献列表完成刷新`,
    });
    const afterPage = currentPageNumber();
    if (afterPage !== beforePage + 1) {
      throw new Error(`翻页校验失败：预期第 ${beforePage + 1} 页，实际第 ${afterPage} 页`);
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
        "等待 MathSciNet 搜索结果总数",
        30000,
        250,
      );
      state.pages = Math.ceil(state.total / 100);
      setProgress();
      let startPage = 1;
      if (resumingPendingPage) {
        startPage = pendingPage;
        const expectedCount = Math.min(100, state.total - (startPage - 1) * 100);
        setStatus(`正在恢复第 ${startPage}/${state.pages} 页…`);
        await waitForRecordSet({
          expectedCount,
          expectedRequestedPage: startPage,
          description: `等待直接访问的第 ${startPage} 页文献列表稳定到 ${expectedCount} 条`,
        });
      } else {
        setStatus(`识别到 ${state.total} 条结果，正在切换到每页 100 条…`);
        await goToFirstPage();
        await setPageSizeTo100();
      }

      for (let page = startPage; page <= state.pages; page += 1) {
        state.page = page;
        setProgress();
        setStatus(`正在处理第 ${page}/${state.pages} 页…`);

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
            throw new Error(
              `待续页累计数量校验失败：处理第 ${page} 页后预期 ${expectedCumulativeCount} 条，实际 ${state.entries.length} 条`,
            );
          }
          state.pendingPage = null;
        }
        await saveProgress("running");
        setProgress();

        if (page < state.pages) {
          const advanceResult = await goToNextPage(page);
          if (advanceResult === PAGE_ADVANCE_RESULT.navigating) return;
          if (advanceResult === PAGE_ADVANCE_RESULT.unavailable) {
            throw new Error(`第 ${page} 页处理完毕，但没有找到可用的 Next 按钮`);
          }
        }
      }

      if (state.entries.length !== state.total) {
        throw new Error(`导出数量校验失败：页面显示 ${state.total} 条，实际收集 ${state.entries.length} 条`);
      }
      const download = downloadBibtex(false);
      await saveProgress("complete");
      setStatus(`完成：${download.count} 条，已下载 ${download.filename}`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const terminalStatus = state.cancelled ? "cancelled" : "error";
      state.jobStatus = terminalStatus;
      let persistenceMessage = "";
      try {
        await saveProgress(terminalStatus);
      } catch (storageError) {
        persistenceMessage = `；另有进度保存错误：${storageError.message}`;
      }
      setStatus(
        `${state.cancelled ? "已停止" : "失败"}：${message}${persistenceMessage}。可下载内存中已收集结果。`,
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
    setStatus(`发现上次未完成任务：已保留 ${state.entries.length} 条，可先下载部分结果。`, "warning");
    return job;
  }

  function mountPanel() {
    if (document.querySelector("#msbe-root")) return;
    const rootElement = document.createElement("aside");
    rootElement.id = "msbe-root";
    rootElement.innerHTML = `
      <style>
        #msbe-root,#msbe-root *{box-sizing:border-box}
        #msbe-launcher{position:fixed;right:18px;bottom:18px;z-index:2147483647;width:48px;height:48px;border:0;border-radius:50%;background:#6750a4;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.28);cursor:pointer;font:700 20px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        #msbe-launcher:hover{background:#57408f} #msbe-launcher:focus-visible{outline:3px solid #b9a7ee;outline-offset:3px}
        #msbe-launcher[data-kind="success"]{background:#167744} #msbe-launcher[data-kind="error"]{background:#b42318} #msbe-launcher[data-kind="warning"]{background:#9a6700}
        #msbe-launcher-badge{position:absolute;right:-8px;top:-7px;min-width:27px;padding:3px 5px;border:2px solid #fff;border-radius:12px;background:#24242a;color:#fff;font:600 10px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums}
        #msbe-launcher-badge[hidden],#msbe-panel[hidden]{display:none!important}
        #msbe-panel{position:fixed;right:18px;bottom:78px;z-index:2147483647;width:min(330px,calc(100vw - 36px));max-height:calc(100vh - 110px);overflow:auto;padding:14px;border:1px solid #c8c8d0;border-radius:12px;background:#fff;color:#24242a;box-shadow:0 8px 28px rgba(0,0,0,.22);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        #msbe-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 8px}
        #msbe-panel h2{margin:0;font-size:16px}
        #msbe-collapse{width:28px;height:28px;border:0;border-radius:6px;background:transparent;color:#5d5d68;cursor:pointer;font-size:21px;line-height:1}
        #msbe-collapse:hover{background:#f0eef6;color:#24242a}
        #msbe-status{min-height:42px;margin:0 0 8px;overflow-wrap:anywhere}
        #msbe-status[data-kind="success"]{color:#0b6b32} #msbe-status[data-kind="error"]{color:#b42318} #msbe-status[data-kind="warning"]{color:#8a5800}
        #msbe-progress{margin:0 0 10px;color:#5d5d68;font-variant-numeric:tabular-nums}
        #msbe-actions{display:flex;gap:7px;flex-wrap:wrap}
        #msbe-actions button{border:1px solid #6750a4;border-radius:7px;padding:7px 10px;background:#6750a4;color:#fff;cursor:pointer}
        #msbe-actions button:nth-child(n+2){background:#fff;color:#4d3c7d}
        #msbe-actions button:disabled{cursor:not-allowed;opacity:.45}
      </style>
      <button id="msbe-launcher" type="button" aria-controls="msbe-panel" aria-expanded="false" aria-label="展开 MathSciNet 批量导出" title="MathSciNet 批量导出">
        <span aria-hidden="true">↓</span><span id="msbe-launcher-badge" hidden></span>
      </button>
      <section id="msbe-panel" hidden aria-labelledby="msbe-title">
        <div id="msbe-heading">
          <h2 id="msbe-title">MathSciNet 批量导出</h2>
          <button id="msbe-collapse" type="button" aria-label="收起导出面板" title="收起">×</button>
        </div>
        <p id="msbe-status">准备就绪。停留在搜索结果页后点击“全部导出”。</p>
        <p id="msbe-progress">0/? 页 · 0 条</p>
        <div id="msbe-actions">
          <button id="msbe-start" type="button">全部导出</button>
          <button id="msbe-stop" type="button" disabled>停止</button>
          <button id="msbe-partial" type="button" disabled>下载已收集</button>
        </div>
      </section>`;
    document.documentElement.append(rootElement);

    const launcher = rootElement.querySelector("#msbe-launcher");
    const panel = rootElement.querySelector("#msbe-panel");
    const setPanelExpanded = (expanded) => {
      panel.hidden = !expanded;
      launcher.setAttribute("aria-expanded", String(expanded));
      launcher.setAttribute("aria-label", `${expanded ? "收起" : "展开"} MathSciNet 批量导出`);
    };
    launcher.addEventListener("click", () => {
      setPanelExpanded(panel.hidden);
    });
    rootElement.querySelector("#msbe-collapse").addEventListener("click", () => setPanelExpanded(false));

    rootElement.querySelector("#msbe-start").addEventListener("click", () => runExport());
    rootElement.querySelector("#msbe-stop").addEventListener("click", () => {
      state.cancelled = true;
      setStatus("正在停止；已收集内容不会丢失…", "warning");
    });
    rootElement.querySelector("#msbe-partial").addEventListener("click", () => {
      try {
        const download = downloadBibtex(true);
        setStatus(`已下载部分结果：${download.count} 条`, "warning");
      } catch (error) {
        setStatus(error.message, "error");
      }
    });

    restoreProgress()
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
      .catch((error) => setStatus(`读取上次进度失败：${error.message}`, "error"));
  }

  return {
    getState: () => ({ ...state, entries: [...state.entries] }),
    mountPanel,
    runExport,
  };
});
