(function exposeMathSciNetI18n(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MathSciNetI18n = api;
})(typeof globalThis === "object" ? globalThis : this, function buildI18n() {
  "use strict";

  const SETTINGS_KEY = "mathscinetBibtexExporterSettingsV1";
  const DEFAULT_SETTINGS = Object.freeze({ language: "auto" });
  const SUPPORTED_SETTINGS = Object.freeze(["auto", "zh-CN", "en"]);

  const DICTIONARIES = Object.freeze({
    "zh-CN": Object.freeze({
      "extension.name": "MathSciNet BibTeX 批量导出",
      "extension.description": "将 MathSciNet 检索结果逐页导出为一个去重后的 BibTeX 文件。",
      "popup.version": "版本 {version}",
      "popup.siteLabel": "当前站点",
      "popup.siteSupported": "可在此页面使用",
      "popup.siteUnsupported": "请打开 MathSciNet 检索结果页",
      "popup.siteCheckFailed": "无法检查当前标签页",
      "popup.siteCheckError": "无法检查当前标签页：{message}",
      "popup.languageLabel": "界面语言",
      "popup.languageHint": "网页内面板会立即同步，不会中断导出。",
      "popup.auto": "自动",
      "popup.chinese": "中文",
      "popup.english": "English",
      "popup.loading": "正在读取设置…",
      "popup.loadError": "读取设置失败：{message}",
      "popup.saved": "设置已保存",
      "popup.saveError": "保存失败：{message}",
      "popup.ariaLanguage": "选择界面语言",
      "panel.title": "MathSciNet 批量导出",
      "panel.ready": "准备就绪。停留在搜索结果页后点击“全部导出”。",
      "panel.exportAll": "全部导出",
      "panel.stop": "停止",
      "panel.downloadCollected": "下载已收集",
      "panel.collapse": "收起",
      "panel.ariaExpand": "展开 MathSciNet 批量导出",
      "panel.ariaCollapse": "收起 MathSciNet 批量导出",
      "panel.ariaProgress": "导出进度",
      "panel.launcherTitle": "MathSciNet 批量导出：{status}",
      "progress.summary": "{page}/{pages} 页 · {count} 条",
      "status.recoveringPage": "正在恢复第 {page}/{pages} 页…",
      "status.detectedTotal": "识别到 {total} 条结果，正在切换到每页 100 条…",
      "status.processingPage": "正在处理第 {page}/{pages} 页…",
      "status.complete": "完成：{count} 条，已下载 {filename}",
      "status.stopping": "正在停止；已收集内容不会丢失…",
      "status.partialDownloaded": "已下载部分结果：{count} 条",
      "status.restoreFound": "发现上次未完成任务：已保留 {count} 条，可先下载部分结果。",
      "status.restoreReadFailed": "读取上次进度失败：{message}",
      "status.settingReadFailed": "读取语言设置失败：{message}",
      "status.failed": "失败：{message}{persistence}。可下载内存中已收集结果。",
      "status.cancelled": "已停止：{message}{persistence}。可下载内存中已收集结果。",
      "status.persistenceError": "；另有进度保存错误：{message}",
      "error.userStopped": "任务已由用户停止",
      "error.timeout": "{operation}超时",
      "error.noDownload": "当前还没有可下载的 BibTeX 记录",
      "error.noPageSize100": "页面数量菜单中没有 100 条选项",
      "error.ambiguousNamedControl": "分页器内找到 {count} 个匹配的 {label} 控件；为防止误点，任务已停止",
      "error.ambiguousNumberedControl": "分页器内找到 {count} 个第 {page} 页控件；为防止误点，任务已停止",
      "error.ambiguousDisabledControl": "分页器内找到 {count} 个禁用的 {label} 控件；为防止误点，任务已停止",
      "error.cannotVerifyFirstPage": "无法明确验证当前为第 1 页；为防止漏页，任务已停止",
      "error.cannotReadPageSize": "无法读取当前每页记录数；为防止漏页，任务已停止",
      "error.exportButtonMissing": "没有找到 MathSciNet 的 Export 按钮",
      "error.clipboardRead": "读取剪贴板失败：{message}",
      "error.noBibtex": "MathSciNet 已响应，但没有识别到 BibTeX 文本",
      "error.beforePageMismatch": "翻页前页码校验失败：刚处理第 {processed} 页，页面显示第 {displayed} 页",
      "error.afterPageMismatch": "翻页校验失败：预期第 {expected} 页，实际第 {actual} 页",
      "error.resumeCountMismatch": "待续页累计数量校验失败：处理第 {page} 页后预期 {expected} 条，实际 {actual} 条",
      "error.nextMissing": "第 {page} 页处理完毕，但没有找到可用的 Next 按钮",
      "error.totalCountMismatch": "导出数量校验失败：页面显示 {expected} 条，实际收集 {actual} 条",
      "operation.waitResultTotal": "等待 MathSciNet 搜索结果总数",
      "operation.waitPageSize": "等待每页数量选项",
      "operation.waitStableResults": "等待结果列表稳定到 {count} 条",
      "operation.waitPageSizeRefresh": "等待每页 100 条的结果列表完成刷新",
      "operation.waitFirstPage": "等待第一页文献列表完成刷新",
      "operation.waitSelectAll": "等待全选框",
      "operation.selectAll": "全选当前页",
      "operation.openExport": "打开 Export 菜单",
      "operation.waitCitationFormat": "等待引用格式菜单",
      "operation.waitGetCitations": "等待 Get Citations 按钮",
      "operation.waitBibtex": "等待 MathSciNet 生成 BibTeX",
      "operation.waitPageRefresh": "等待第 {page} 页文献列表完成刷新",
      "operation.waitDirectPage": "等待直接访问的第 {page} 页文献列表稳定到 {count} 条"
    }),
    en: Object.freeze({
      "extension.name": "MathSciNet BibTeX Batch Exporter",
      "extension.description": "Export every MathSciNet result page into one deduplicated BibTeX file.",
      "popup.version": "Version {version}",
      "popup.siteLabel": "Current site",
      "popup.siteSupported": "Available on this page",
      "popup.siteUnsupported": "Open a MathSciNet search-results page",
      "popup.siteCheckFailed": "Could not inspect the current tab",
      "popup.siteCheckError": "Could not inspect the current tab: {message}",
      "popup.languageLabel": "Interface language",
      "popup.languageHint": "The page panel updates instantly without interrupting an export.",
      "popup.auto": "Auto",
      "popup.chinese": "中文",
      "popup.english": "English",
      "popup.loading": "Loading settings…",
      "popup.loadError": "Could not load settings: {message}",
      "popup.saved": "Setting saved",
      "popup.saveError": "Could not save: {message}",
      "popup.ariaLanguage": "Choose interface language",
      "panel.title": "MathSciNet Batch Export",
      "panel.ready": "Ready. Open a search-results page, then select “Export all”.",
      "panel.exportAll": "Export all",
      "panel.stop": "Stop",
      "panel.downloadCollected": "Download collected",
      "panel.collapse": "Collapse",
      "panel.ariaExpand": "Expand MathSciNet batch export",
      "panel.ariaCollapse": "Collapse MathSciNet batch export",
      "panel.ariaProgress": "Export progress",
      "panel.launcherTitle": "MathSciNet batch export: {status}",
      "progress.summary": "{page}/{pages} pages · {count} records",
      "status.recoveringPage": "Resuming page {page}/{pages}…",
      "status.detectedTotal": "Found {total} results. Switching to 100 results per page…",
      "status.processingPage": "Processing page {page}/{pages}…",
      "status.complete": "Complete: {count} records. Downloaded {filename}",
      "status.stopping": "Stopping… Collected records will be kept.",
      "status.partialDownloaded": "Downloaded partial results: {count} records",
      "status.restoreFound": "Found an unfinished export with {count} saved records. You can download them now.",
      "status.restoreReadFailed": "Could not read saved progress: {message}",
      "status.settingReadFailed": "Could not read the language setting: {message}",
      "status.failed": "Failed: {message}{persistence}. You can download records kept in memory.",
      "status.cancelled": "Stopped: {message}{persistence}. You can download records kept in memory.",
      "status.persistenceError": "; progress could not also be saved: {message}",
      "error.userStopped": "The task was stopped by the user",
      "error.timeout": "Timed out while {operation}",
      "error.noDownload": "There are no BibTeX records to download yet",
      "error.noPageSize100": "The results-per-page menu has no 100 option",
      "error.ambiguousNamedControl": "Found {count} matching {label} controls in the paginator. Stopped to avoid a wrong click",
      "error.ambiguousNumberedControl": "Found {count} controls for page {page} in the paginator. Stopped to avoid a wrong click",
      "error.ambiguousDisabledControl": "Found {count} disabled {label} controls in the paginator. Stopped to avoid a wrong click",
      "error.cannotVerifyFirstPage": "Could not verify page 1. Stopped to avoid missing results",
      "error.cannotReadPageSize": "Could not read the current results-per-page value. Stopped to avoid missing results",
      "error.exportButtonMissing": "Could not find MathSciNet's Export button",
      "error.clipboardRead": "Could not read the clipboard: {message}",
      "error.noBibtex": "MathSciNet responded, but no BibTeX text was detected",
      "error.beforePageMismatch": "Page check failed before navigation: processed page {processed}, but the page shows {displayed}",
      "error.afterPageMismatch": "Page check failed after navigation: expected page {expected}, got page {actual}",
      "error.resumeCountMismatch": "Resume count check failed after page {page}: expected {expected} records, got {actual}",
      "error.nextMissing": "Page {page} finished, but no unambiguous Next control was available",
      "error.totalCountMismatch": "Export count check failed: the page shows {expected} records, but {actual} were collected",
      "operation.waitResultTotal": "waiting for the MathSciNet result total",
      "operation.waitPageSize": "waiting for the results-per-page selector",
      "operation.waitStableResults": "waiting for the result list to stabilize at {count} records",
      "operation.waitPageSizeRefresh": "waiting for the 100-result page to finish refreshing",
      "operation.waitFirstPage": "waiting for the first-page result list to refresh",
      "operation.waitSelectAll": "waiting for Select all on page",
      "operation.selectAll": "selecting all records on this page",
      "operation.openExport": "opening the Export controls",
      "operation.waitCitationFormat": "waiting for the citation-format menu",
      "operation.waitGetCitations": "waiting for the Get Citations button",
      "operation.waitBibtex": "waiting for MathSciNet to generate BibTeX",
      "operation.waitPageRefresh": "waiting for the page {page} result list to refresh",
      "operation.waitDirectPage": "waiting for directly opened page {page} to stabilize at {count} records"
    })
  });

  function normalizeLanguageSetting(language) {
    return SUPPORTED_SETTINGS.includes(language) ? language : DEFAULT_SETTINGS.language;
  }

  function resolveLanguage(language, uiLanguage = "en") {
    const selected = normalizeLanguageSetting(language);
    if (selected !== "auto") return selected;
    return String(uiLanguage || "").toLowerCase().startsWith("zh") ? "zh-CN" : "en";
  }

  function createTranslator({ language = DEFAULT_SETTINGS.language, uiLanguage = "en" } = {}) {
    const resolvedLanguage = resolveLanguage(language, uiLanguage);
    const dictionary = DICTIONARIES[resolvedLanguage];

    function t(key, params = {}) {
      const template = dictionary[key];
      if (typeof template !== "string") {
        throw new Error(`Missing translation: ${resolvedLanguage}.${key}`);
      }
      return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (_match, name) => {
        if (!Object.prototype.hasOwnProperty.call(params, name)) {
          throw new Error(`Missing interpolation value: ${key}.${name}`);
        }
        return String(params[name]);
      });
    }

    return Object.freeze({ language: resolvedLanguage, t });
  }

  return Object.freeze({
    DEFAULT_SETTINGS,
    DICTIONARIES,
    SETTINGS_KEY,
    SUPPORTED_SETTINGS,
    createTranslator,
    normalizeLanguageSetting,
    resolveLanguage
  });
});
