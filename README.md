# MathSciNet BibTeX Batch Exporter

本地 Chrome 扩展，用于将当前 MathSciNet 检索结果自动逐页导出为一个去重后的 BibTeX 文件。扩展不向第三方服务上传数据。

## 安装

1. 在 Chrome 地址栏打开 `chrome://extensions`。
2. 打开右上角的“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本目录：`/Users/guoyiyang/Documents/GitHub/mathscinet-bibtex-exporter`。
5. 刷新 MathSciNet 搜索结果页。

## 使用

1. 在 MathSciNet 中完成一次检索，并停留在结果列表页。
2. 点击右下角面板里的“全部导出”。
3. 保持该标签页在浏览器中打开，不要手动翻页或点击其他结果。
4. 完成后 Chrome 会下载一个 `mathscinet_日期_记录数_records.bib` 文件。

若网站界面发生变化导致中途失败，面板会保留已收集记录。点击“下载已收集”可保存部分结果，并把面板中的精确错误信息发给 Codex。

## 当前支持的站点

- `mathscinet.ams.org`
- University of Nottingham EZproxy 下的 MathSciNet
