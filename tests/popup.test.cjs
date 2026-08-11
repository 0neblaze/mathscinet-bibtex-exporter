const test = require("node:test");
const assert = require("node:assert/strict");

const i18n = require("../extension/i18n.js");
const { createPopup, isSupportedMathSciNetUrl } = require("../extension/popup.js");
const projectVersion = require("../package.json").version;

class FakeElement {
  constructor(language = null) {
    this.dataset = language ? { language } : {};
    this.attributes = {};
    this.disabled = false;
    this.listeners = new Map();
    this.textContent = "";
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  async click() {
    return this.listeners.get("click")?.({ currentTarget: this });
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }
}

function createScenario({
  failRead = false,
  failTabQuery = false,
  failWrite = false,
  savedLanguage,
  uiLanguage = "en-US",
} = {}) {
  const elements = new Map([
    ["#popup-title", new FakeElement()],
    ["#popup-version", new FakeElement()],
    ["#popup-site-label", new FakeElement()],
    ["#popup-site-status", new FakeElement()],
    ["#popup-language-label", new FakeElement()],
    ["#popup-language-hint", new FakeElement()],
    ["#popup-feedback", new FakeElement()],
    ["#popup-language-group", new FakeElement()],
  ]);
  const languageButtons = [new FakeElement("auto"), new FakeElement("zh-CN"), new FakeElement("en")];
  const writes = [];
  const storageListeners = [];
  const chrome = {
    i18n: { getUILanguage: () => uiLanguage },
    runtime: { getManifest: () => ({ version: projectVersion }) },
    storage: {
      local: {
        async get() {
          if (failRead) throw new Error("storage unavailable");
          return savedLanguage ? { [i18n.SETTINGS_KEY]: { language: savedLanguage } } : {};
        },
        async set(value) {
          if (failWrite) throw new Error("disk unavailable");
          writes.push(value);
        },
      },
      onChanged: {
        addListener(listener) {
          storageListeners.push(listener);
        },
      },
    },
    tabs: {
      async query() {
        if (failTabQuery) throw new Error("tabs unavailable");
        return [{ url: "https://mathscinet.ams.org/mathscinet/publications-search?query=test" }];
      },
    },
  };
  const document = {
    documentElement: { lang: "" },
    title: "",
    querySelector(selector) {
      return elements.get(selector) || null;
    },
    querySelectorAll(selector) {
      return selector === "[data-language]" ? languageButtons : [];
    },
  };
  return { chrome, document, elements, languageButtons, storageListeners, writes };
}

test("recognizes only supported MathSciNet pages", () => {
  assert.equal(isSupportedMathSciNetUrl("https://mathscinet.ams.org/mathscinet/publications-search?query=x"), true);
  assert.equal(
    isSupportedMathSciNetUrl("https://mathscinet-ams-org.ezproxy.nottingham.edu.cn/mathscinet/publications-search"),
    true,
  );
  assert.equal(isSupportedMathSciNetUrl("https://example.com/?next=mathscinet"), false);
});

test("popup defaults to auto and follows the browser language", async () => {
  const scenario = createScenario({ uiLanguage: "zh-CN" });
  const popup = createPopup({ ...scenario, MathSciNetI18n: i18n });

  await popup.initialize();

  assert.equal(scenario.document.documentElement.lang, "zh-CN");
  assert.equal(scenario.document.title, "MathSciNet BibTeX 批量导出");
  assert.equal(scenario.elements.get("#popup-title").textContent, "MathSciNet BibTeX 批量导出");
  assert.equal(scenario.elements.get("#popup-site-status").textContent, "可在此页面使用");
  assert.equal(scenario.languageButtons[0].attributes["aria-pressed"], "true");
  assert.equal(scenario.elements.get("#popup-language-group").dataset.selectedIndex, "0");
});

test("popup restores a manual language and persists a new selection", async () => {
  const scenario = createScenario({ savedLanguage: "en", uiLanguage: "zh-CN" });
  const popup = createPopup({ ...scenario, MathSciNetI18n: i18n });
  await popup.initialize();

  assert.equal(scenario.elements.get("#popup-title").textContent, "MathSciNet BibTeX Batch Exporter");
  await scenario.languageButtons[1].click();

  assert.deepEqual(scenario.writes, [{ [i18n.SETTINGS_KEY]: { language: "zh-CN" } }]);
  assert.equal(scenario.elements.get("#popup-feedback").textContent, "设置已保存");
  assert.equal(scenario.languageButtons[1].attributes["aria-pressed"], "true");
  assert.equal(scenario.elements.get("#popup-language-group").dataset.selectedIndex, "1");
});

test("popup reports a failed setting write in the selected language", async () => {
  const scenario = createScenario({ savedLanguage: "en", failWrite: true });
  const popup = createPopup({ ...scenario, MathSciNetI18n: i18n });
  await popup.initialize();

  await scenario.languageButtons[1].click();

  assert.equal(scenario.elements.get("#popup-title").textContent, "MathSciNet BibTeX Batch Exporter");
  assert.equal(scenario.elements.get("#popup-feedback").textContent, "Could not save: disk unavailable");
  assert.equal(scenario.elements.get("#popup-feedback").dataset.kind, "error");
  assert.equal(scenario.languageButtons[2].attributes["aria-pressed"], "true");
  assert.equal(scenario.elements.get("#popup-language-group").dataset.selectedIndex, "2");
});

test("popup surfaces setting and tab read failures instead of staying in loading state", async () => {
  const storageFailure = createScenario({ failRead: true });
  await createPopup({ ...storageFailure, MathSciNetI18n: i18n }).initialize();
  assert.equal(
    storageFailure.elements.get("#popup-feedback").textContent,
    "Could not load settings: storage unavailable",
  );

  const tabFailure = createScenario({ failTabQuery: true });
  await createPopup({ ...tabFailure, MathSciNetI18n: i18n }).initialize();
  assert.equal(tabFailure.elements.get("#popup-site-status").textContent, "Could not inspect the current tab");
  assert.equal(tabFailure.elements.get("#popup-feedback").textContent, "Could not inspect the current tab: tabs unavailable");
});

test("deleting the stored setting returns an open popup to Auto", async () => {
  const scenario = createScenario({ savedLanguage: "en", uiLanguage: "zh-CN" });
  await createPopup({ ...scenario, MathSciNetI18n: i18n }).initialize();

  scenario.storageListeners[0](
    { [i18n.SETTINGS_KEY]: { oldValue: { language: "en" }, newValue: { language: "zh-CN" } } },
    "local",
  );
  assert.equal(scenario.languageButtons[1].attributes["aria-pressed"], "true");
  assert.equal(scenario.elements.get("#popup-language-group").dataset.selectedIndex, "1");

  scenario.storageListeners[0]({ [i18n.SETTINGS_KEY]: { oldValue: { language: "en" } } }, "local");

  assert.equal(scenario.elements.get("#popup-title").textContent, "MathSciNet BibTeX 批量导出");
  assert.equal(scenario.languageButtons[0].attributes["aria-pressed"], "true");
  assert.equal(scenario.elements.get("#popup-language-group").dataset.selectedIndex, "0");
});
