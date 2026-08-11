# MathSciNet BibTeX Batch Exporter

本地 Chrome 扩展，用于把当前 MathSciNet 检索结果自动逐页导出为一个去重后的 BibTeX 文件。扩展提供中文和 English 界面，只在 MathSciNet 页面内运行，不会向第三方服务上传检索结果或 BibTeX 数据。

## 功能

- 点击一次“全部导出”后，自动展开 MathSciNet 的 Export 区、全选当前页并获取 BibTeX。
- 自动切换为每页 100 条，并通过当前结果分页器逐页处理。
- 按引用键去重，完成后下载一个合并的 `.bib` 文件。
- 页面右下角默认只显示悬浮按钮；展开后可查看进度、停止任务或下载已收集结果。
- 点击 Chrome 右上角扩展图标，可在 `Auto / 中文 / English` 间切换；已打开的网页面板会立即同步，不会中断任务。
- 中途失败或停止时，把已收集内容保存在 Chrome 本地存储中，以便恢复或部分下载。

## 从 GitHub Release 安装

1. 从 GitHub Release 下载 `mathscinet-bibtex-exporter-v0.3.0.zip`。
2. 解压 ZIP；不要直接把 ZIP 拖入 Chrome。
3. 在 Chrome 地址栏打开 `chrome://extensions`。
4. 打开右上角“开发者模式”。
5. 点击“加载已解压的扩展程序”，选择刚解压的目录。
6. 刷新 MathSciNet 搜索结果页。

该扩展没有 Chrome Web Store 签名，因此发布包使用可审计的 ZIP，不提供 `.crx`。

## 从源码安装

按照上面的 Chrome 操作步骤，直接选择本仓库根目录即可。

## 使用

1. 在 MathSciNet 中完成检索并停留在结果列表页。
2. 如需切换语言，点击 Chrome 右上角扩展图标。首次默认为 `Auto`：浏览器语言为中文时使用简体中文，否则使用 English。
3. 点击页面右下角圆形悬浮按钮，再点击“全部导出”或 `Export all`。不需要手动点击 MathSciNet 自身的 Export 按钮。
4. 任务运行时可以收起面板，但请保持该标签页打开，不要手动翻页或修改检索条件。
5. 完成后 Chrome 会下载 `mathscinet_日期_记录数_records.bib`。

扩展不会创建欢迎页、初始化页或独立设置页，也不会在安装后自动打开新标签页。

若网站界面变化导致中途失败，展开面板并点击“下载已收集”即可保存部分结果。错误信息会保留预期页码等诊断信息。

## 本地验证与打包

```bash
node --test *.test.cjs
./scripts/package-release.sh
```

打包产物生成在 `dist/`，包括 Release ZIP 和对应的 SHA-256 校验文件。ZIP 根目录直接包含可加载的扩展文件；脚本会拒绝打包与 `manifest.json` 版本不一致的版本号。

## 当前支持的站点

- `mathscinet.ams.org`
- University of Nottingham EZproxy 下的 MathSciNet

## License

[MIT](LICENSE)
