<div align="center">
  <img src="extension/icons/icon-128.png" width="96" height="96" alt="MathSciNet BibTeX 批量导出图标">
  <h1>MathSciNet BibTeX 批量导出</h1>
  <p>可靠、可恢复、支持中英双语的 MathSciNet Chrome 批量导出扩展。</p>
  <p><a href="README.md">English</a> | <strong>简体中文</strong></p>
  <p>
    <a href="https://github.com/0neblaze/mathscinet-bibtex-exporter/releases/latest"><img alt="最新版本" src="https://img.shields.io/github/v/release/0neblaze/mathscinet-bibtex-exporter?display_name=tag&amp;sort=semver"></a>
    <a href="https://github.com/0neblaze/mathscinet-bibtex-exporter/actions/workflows/ci.yml"><img alt="持续集成" src="https://github.com/0neblaze/mathscinet-bibtex-exporter/actions/workflows/ci.yml/badge.svg"></a>
    <a href="LICENSE"><img alt="MIT 许可证" src="https://img.shields.io/badge/License-MIT-0b4f9c.svg"></a>
    <img alt="Chrome Manifest V3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-ed6b24">
  </p>
</div>

## 为什么需要这个扩展？

MathSciNet 自身只能逐页导出引文。这个扩展会自动处理完整检索结果，同时让进度保持可见，并支持中断恢复。

| 一键导出 | 安全翻页 | 断点恢复 | 中英双语 |
| --- | --- | --- | --- |
| 自动打开 Export、全选当前页、选择 BibTeX 并收集引文。 | 只使用当前结果分页器，并同时验证页码和文献签名。 | 进度保存在 Chrome 本地，可恢复任务或下载已收集内容。 | 无需刷新即可在 Auto、简体中文和 English 间切换，不会中断任务。 |

## 从 GitHub Release 安装

1. 打开[最新版本页面](https://github.com/0neblaze/mathscinet-bibtex-exporter/releases/latest)。
2. 下载名为 `mathscinet-bibtex-exporter-v<版本号>.zip` 的资产，**不要下载** GitHub 自动生成的 Source code 源码压缩包。
3. 解压 ZIP，得到 `mathscinet-bibtex-exporter-v<版本号>` 文件夹。
4. 在 Chrome 中打开 `chrome://extensions`，开启右上角的**开发者模式**。
5. 点击**加载已解压的扩展程序**，选择刚才解压出的文件夹。
6. 刷新已经打开的 MathSciNet 检索结果页。

ZIP 旁边同时提供 SHA-256 校验文件。本项目不发布 `.crx`，因为未打包扩展更容易审计，也不依赖 Chrome Web Store 签名。

## 使用方法

1. 在 MathSciNet 中完成 Publications 检索。
2. 点击页面右下角约 48 px 的圆形悬浮按钮。
3. 点击**全部导出**。即使收起面板，任务也会继续运行。
4. 导出期间保持标签页打开，不要手动修改检索条件或页码。
5. 当收集数量与 MathSciNet 实时总数一致时，Chrome 会下载一个去重后的 `.bib` 文件。

若网站变化或网络中断导致任务停止，可点击**下载已收集**保存已经获取的记录。

## 界面语言

点击 Chrome 工具栏中的扩展图标，然后选择：

- **Auto**：浏览器语言为中文时使用简体中文，否则使用 English。
- **中文**：始终使用简体中文。
- **English**：始终使用英文。

已打开的 MathSciNet 面板会立即同步语言，不会重置页码、已收集记录、进度或任务状态。

## 隐私与权限

- `storage`：在 Chrome 扩展本地存储中保存导出进度和语言设置。
- `clipboardRead`：仅当 MathSciNet 通过复制控件提供生成的 BibTeX 时读取相应内容。
- 站点权限仅限 `mathscinet.ams.org` 和 University of Nottingham 的 EZproxy 主机。
- 不包含分析、追踪、外部字体或第三方网络服务。

## 故障排查

- 确认下载的是命名的 Release 资产，而不是 Source code 源码压缩包。
- 更新扩展后，在 `chrome://extensions` 点击**重新加载**，再刷新 MathSciNet。
- 导出期间保持 MathSciNet 结果页打开。
- 若分页或数量不再匹配，请停止任务，不要手动猜测控件；面板会保留可供下载的部分结果。

## 本地开发

```bash
git clone https://github.com/0neblaze/mathscinet-bibtex-exporter.git
cd mathscinet-bibtex-exporter
npm test
npm run check
npm run package
```

从源码测试时可以直接加载 [`extension/`](extension/)；可复现的 Release 产物生成到已被 Git 忽略的 `dist/` 目录。

## 支持的站点

- `https://mathscinet.ams.org/`
- University of Nottingham EZproxy 下的 MathSciNet

## 贡献与安全

欢迎使用中文或英文提交 Issue 和 Pull Request。贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)；安全问题请按照 [SECURITY.md](SECURITY.md) 报告。

本项目采用 [MIT License](LICENSE)。
