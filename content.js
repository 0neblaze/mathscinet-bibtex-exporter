(function startMathSciNetExporter() {
  "use strict";

  if (globalThis.__mathSciNetBatchExporterLoaded) return;
  globalThis.__mathSciNetBatchExporterLoaded = true;

  const lib = globalThis.MathSciNetExportLib;
  const STORAGE_KEY = "mathscinetBibtexBatchJobV1";
  const state = {
    running: false,
    cancelled: false,
    entries: [],
    page: 0,
    pages: 0,
    total: 0,
    jobStatus: "idle",
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

  function findControl(labels, selector = "button, [role='button'], [role='menuitem'], a") {
    const wanted = labels.map((label) => label.toLowerCase());
    return visibleElements(selector).find((element) => {
      if (elementIsDisabled(element)) return false;
      const values = [
        normalizedText(element),
        element.getAttribute("aria-label") || "",
        element.getAttribute("title") || "",
      ].map((value) => value.toLowerCase());
      return values.some((value) => wanted.some((label) => value === label || value.includes(label)));
    });
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
      if (/^(page|pagenumber|start|offset)$/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString();
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
        total: state.total,
        searchIdentity: state.searchIdentity,
        updatedAt: new Date().toISOString(),
      },
    });
    state.jobStatus = status;
  }

  function setStatus(message, kind = "normal") {
    const status = document.querySelector("#msbe-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind;
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
    if (!progress) return;
    progress.textContent = `${state.page}/${state.pages || "?"} 页 · ${state.entries.length} 条`;
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
          (expectedPage !== null && currentPageNumber() !== expectedPage)
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

  function currentPageNumber() {
    const current = visibleElements("[aria-current]").find((element) => /^\d+$/.test(normalizedText(element)));
    if (current) return Number(normalizedText(current));

    const selected = visibleElements(
      "button, [role='button'], [role='menuitem'], a, li, [class*='page']",
    ).find((element) => {
      const marker = `${String(element.className || "")} ${element.getAttribute("aria-selected") || ""}`;
      return /^\d+$/.test(normalizedText(element)) && /(active|current|selected|true)/i.test(marker);
    });
    return selected ? Number(normalizedText(selected)) : null;
  }

  function findFirstPageControl() {
    return visibleElements("button, [role='button'], [role='menuitem'], a").find((element) => {
      const text = normalizedText(element).toLowerCase();
      const label = String(element.getAttribute("aria-label") || "").toLowerCase();
      return text === "first" || label.includes("go to first page");
    });
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
    const close = findControl(["close", "done", "back to results", "cancel"]);
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
    const button = await waitFor(() => findControl(["get citations"]), "等待 Get Citations 按钮");
    button.click();

    let extracted = await waitFor(
      async () => {
        const fresh = bibtexCandidates().find((candidate) => !before.has(candidate));
        if (fresh) return fresh;

        const copy = findControl(["copy", "copy citations", "copy to clipboard"]);
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

  async function goToNextPage() {
    const next = findControl(["go to next page", "next"]);
    if (!next || elementIsDisabled(next)) return false;
    const beforePage = currentPageNumber();
    if (beforePage === null) throw new Error("无法读取当前页码；为防止重复或漏页，任务已停止");
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
    return true;
  }

  async function runExport() {
    if (state.running) return;
    state.running = true;
    state.cancelled = false;
    const currentSearchIdentity = searchIdentity();
    const canResume =
      ["running", "error", "cancelled"].includes(state.jobStatus) &&
      state.searchIdentity === currentSearchIdentity;
    if (!canResume) state.entries = [];
    state.searchIdentity = currentSearchIdentity;
    state.page = 0;
    setButtons();

    try {
      state.total = lib.parseResultCount(document.body.innerText || "");
      if (!state.total) throw new Error("没有在当前页面识别到 MathSciNet 搜索结果总数");
      state.pages = Math.ceil(state.total / 100);
      setProgress();
      setStatus(`识别到 ${state.total} 条结果，正在切换到每页 100 条…`);

      await goToFirstPage();
      await setPageSizeTo100();

      for (let page = 1; page <= state.pages; page += 1) {
        state.page = page;
        setProgress();
        setStatus(`正在处理第 ${page}/${state.pages} 页…`);

        await selectAllRecords();
        await chooseBibtex();
        const pageBibtex = await generateAndExtractBibtex();
        state.entries.push(pageBibtex);
        const deduped = lib.dedupeBibtex(state.entries);
        state.entries = deduped.entries;
        await saveProgress("running");
        setProgress();

        if (page < state.pages) {
          const advanced = await goToNextPage();
          if (!advanced) throw new Error(`第 ${page} 页处理完毕，但没有找到可用的 Next 按钮`);
        }
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
    if (!job || !Array.isArray(job.entries) || job.status === "complete" || !job.searchIdentity) return;
    if (job.searchIdentity !== searchIdentity()) return;
    state.entries = job.entries;
    state.page = Number(job.page) || 0;
    state.pages = Number(job.pages) || 0;
    state.total = Number(job.total) || 0;
    state.jobStatus = job.status;
    state.searchIdentity = job.searchIdentity || searchIdentity();
    setProgress();
    setStatus(`发现上次未完成任务：已保留 ${state.entries.length} 条，可先下载部分结果。`, "warning");
  }

  function mountPanel() {
    if (document.querySelector("#msbe-panel")) return;
    const panel = document.createElement("section");
    panel.id = "msbe-panel";
    panel.innerHTML = `
      <style>
        #msbe-panel{position:fixed;right:18px;bottom:18px;z-index:2147483647;width:330px;padding:14px;border:1px solid #c8c8d0;border-radius:12px;background:#fff;color:#24242a;box-shadow:0 8px 28px rgba(0,0,0,.22);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        #msbe-panel *{box-sizing:border-box}
        #msbe-panel h2{margin:0 0 8px;font-size:16px}
        #msbe-status{min-height:42px;margin:0 0 8px;overflow-wrap:anywhere}
        #msbe-status[data-kind="success"]{color:#0b6b32} #msbe-status[data-kind="error"]{color:#b42318} #msbe-status[data-kind="warning"]{color:#8a5800}
        #msbe-progress{margin:0 0 10px;color:#5d5d68;font-variant-numeric:tabular-nums}
        #msbe-actions{display:flex;gap:7px;flex-wrap:wrap}
        #msbe-actions button{border:1px solid #6750a4;border-radius:7px;padding:7px 10px;background:#6750a4;color:#fff;cursor:pointer}
        #msbe-actions button:nth-child(n+2){background:#fff;color:#4d3c7d}
        #msbe-actions button:disabled{cursor:not-allowed;opacity:.45}
      </style>
      <h2>MathSciNet 批量导出</h2>
      <p id="msbe-status">准备就绪。停留在搜索结果页后点击“全部导出”。</p>
      <p id="msbe-progress">0/? 页 · 0 条</p>
      <div id="msbe-actions">
        <button id="msbe-start" type="button">全部导出</button>
        <button id="msbe-stop" type="button" disabled>停止</button>
        <button id="msbe-partial" type="button" disabled>下载已收集</button>
      </div>`;
    document.documentElement.append(panel);

    panel.querySelector("#msbe-start").addEventListener("click", runExport);
    panel.querySelector("#msbe-stop").addEventListener("click", () => {
      state.cancelled = true;
      setStatus("正在停止；已收集内容不会丢失…", "warning");
    });
    panel.querySelector("#msbe-partial").addEventListener("click", () => {
      try {
        const download = downloadBibtex(true);
        setStatus(`已下载部分结果：${download.count} 条`, "warning");
      } catch (error) {
        setStatus(error.message, "error");
      }
    });

    restoreProgress().catch((error) => setStatus(`读取上次进度失败：${error.message}`, "error"));
  }

  mountPanel();
})();
