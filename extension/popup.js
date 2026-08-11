(function exposeMathSciNetPopup(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
    return;
  }

  const popup = api.createPopup(root);
  root.MathSciNetExporterPopup = popup;
  popup.initialize();
})(typeof globalThis === "object" ? globalThis : this, function buildPopupModule() {
  "use strict";

  const SUPPORTED_HOSTS = new Set([
    "mathscinet.ams.org",
    "mathscinet-ams-org.ezproxy.nottingham.edu.cn",
  ]);

  function isSupportedMathSciNetUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      return (
        url.protocol === "https:" &&
        SUPPORTED_HOSTS.has(url.hostname) &&
        /\/mathscinet\/publications-search(?:\/|$)/.test(url.pathname)
      );
    } catch (_error) {
      return false;
    }
  }

  function createPopup(root) {
    const chrome = root.chrome;
    const document = root.document;
    const i18n = root.MathSciNetI18n;
    let setting = i18n.DEFAULT_SETTINGS.language;
    let siteStatusKey = "popup.siteUnsupported";
    let translator = createCurrentTranslator();

    function createCurrentTranslator() {
      return i18n.createTranslator({
        language: setting,
        uiLanguage: chrome.i18n.getUILanguage(),
      });
    }

    function element(selector) {
      const result = document.querySelector(selector);
      if (!result) throw new Error(`Missing popup element: ${selector}`);
      return result;
    }

    function animateUpdate(target) {
      if (
        root.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
        typeof target.animate !== "function"
      ) {
        return;
      }
      target.animate(
        [
          { opacity: 0.55, transform: "translateY(-2px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 220, easing: "cubic-bezier(.22, 1, .36, 1)" },
      );
    }

    function setFeedback(key = null, params = {}, kind = "normal") {
      const feedback = element("#popup-feedback");
      const nextText = key ? translator.t(key, params) : "";
      const changed = feedback.textContent !== nextText || feedback.dataset.kind !== kind;
      feedback.textContent = nextText;
      feedback.dataset.kind = kind;
      if (changed && nextText) animateUpdate(feedback);
    }

    function render() {
      translator = createCurrentTranslator();
      const t = translator.t;
      document.documentElement.lang = translator.language;
      document.title = t("extension.name");
      element("#popup-title").textContent = t("extension.name");
      element("#popup-version").textContent = t("popup.version", {
        version: chrome.runtime.getManifest().version,
      });
      element("#popup-site-label").textContent = t("popup.siteLabel");
      const siteStatus = element("#popup-site-status");
      const nextSiteStatus = t(siteStatusKey);
      const nextSiteKind = siteStatusKey === "popup.siteSupported" ? "success" : "warning";
      const siteChanged = siteStatus.textContent !== nextSiteStatus || siteStatus.dataset.kind !== nextSiteKind;
      siteStatus.textContent = nextSiteStatus;
      siteStatus.dataset.kind = nextSiteKind;
      if (siteChanged) animateUpdate(siteStatus);
      element("#popup-language-label").textContent = t("popup.languageLabel");
      element("#popup-language-hint").textContent = t("popup.languageHint");
      const languageGroup = element("#popup-language-group");
      languageGroup.setAttribute("aria-label", t("popup.ariaLanguage"));
      languageGroup.dataset.selectedIndex = String({ auto: 0, "zh-CN": 1, en: 2 }[setting]);

      const labels = {
        auto: t("popup.auto"),
        "zh-CN": t("popup.chinese"),
        en: t("popup.english"),
      };
      for (const button of document.querySelectorAll("[data-language]")) {
        button.textContent = labels[button.dataset.language];
        button.setAttribute("aria-pressed", String(button.dataset.language === setting));
      }
    }

    async function selectLanguage(language) {
      const previousSetting = setting;
      setting = i18n.normalizeLanguageSetting(language);
      render();
      setFeedback();
      try {
        await chrome.storage.local.set({
          [i18n.SETTINGS_KEY]: { language: setting },
        });
        setFeedback("popup.saved", {}, "success");
      } catch (error) {
        setting = previousSetting;
        render();
        setFeedback("popup.saveError", { message: error instanceof Error ? error.message : String(error) }, "error");
      }
    }

    async function initialize() {
      setFeedback("popup.loading");
      for (const button of document.querySelectorAll("[data-language]")) {
        button.addEventListener("click", () => selectLanguage(button.dataset.language));
      }

      const [storedResult, tabsResult] = await Promise.allSettled([
        chrome.storage.local.get(i18n.SETTINGS_KEY),
        chrome.tabs.query({ active: true, currentWindow: true }),
      ]);
      const stored = storedResult.status === "fulfilled" ? storedResult.value : {};
      const tabs = tabsResult.status === "fulfilled" ? tabsResult.value : [];
      setting = i18n.normalizeLanguageSetting(stored[i18n.SETTINGS_KEY]?.language);
      siteStatusKey =
        tabsResult.status === "rejected"
          ? "popup.siteCheckFailed"
          : isSupportedMathSciNetUrl(tabs[0]?.url || "")
            ? "popup.siteSupported"
            : "popup.siteUnsupported";
      render();
      if (storedResult.status === "rejected") {
        setFeedback("popup.loadError", { message: String(storedResult.reason?.message || storedResult.reason) }, "error");
      } else if (tabsResult.status === "rejected") {
        setFeedback("popup.siteCheckError", { message: String(tabsResult.reason?.message || tabsResult.reason) }, "error");
      } else {
        setFeedback();
      }

      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local" || !Object.prototype.hasOwnProperty.call(changes, i18n.SETTINGS_KEY)) return;
        setting = i18n.normalizeLanguageSetting(changes[i18n.SETTINGS_KEY].newValue?.language);
        render();
      });
    }

    return Object.freeze({ initialize, selectLanguage });
  }

  return Object.freeze({ createPopup, isSupportedMathSciNetUrl });
});
