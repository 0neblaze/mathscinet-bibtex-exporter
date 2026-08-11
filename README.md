<div align="center">
  <img src="extension/icons/icon-128.png" width="96" height="96" alt="MathSciNet BibTeX Batch Exporter icon">
  <h1>MathSciNet BibTeX Batch Exporter</h1>
  <p>A bilingual Chrome extension for reliable, resumable bulk export of MathSciNet search results.</p>
  <p><strong>English</strong> | <a href="README.zh-CN.md">简体中文</a></p>
  <p>
    <a href="https://github.com/0neblaze/mathscinet-bibtex-exporter/releases/latest"><img alt="Latest Release" src="https://img.shields.io/github/v/release/0neblaze/mathscinet-bibtex-exporter?display_name=tag&amp;sort=semver"></a>
    <a href="https://github.com/0neblaze/mathscinet-bibtex-exporter/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/0neblaze/mathscinet-bibtex-exporter/actions/workflows/ci.yml/badge.svg"></a>
    <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-0b4f9c.svg"></a>
    <img alt="Chrome Manifest V3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-ed6b24">
  </p>
</div>

## Why this extension?

MathSciNet exports citations one page at a time. This extension automates the complete result set while keeping the process visible and recoverable.

| One-click export | Safe pagination | Resumable | Bilingual |
| --- | --- | --- | --- |
| Opens Export, selects the page, chooses BibTeX, and collects citations automatically. | Uses only the active result paginator and verifies both the page number and record signature. | Saves progress locally so interrupted exports can resume or be downloaded partially. | Switches between Auto, 简体中文, and English without refreshing or interrupting a task. |

## Install from GitHub Release

1. Open the [latest release](https://github.com/0neblaze/mathscinet-bibtex-exporter/releases/latest).
2. Download the asset named `mathscinet-bibtex-exporter-v<version>.zip` — **not** GitHub's automatically generated “Source code” archives.
3. Extract the ZIP. It creates a folder named `mathscinet-bibtex-exporter-v<version>`.
4. Open `chrome://extensions` in Chrome and enable **Developer mode**.
5. Select **Load unpacked** and choose the extracted folder.
6. Refresh an open MathSciNet search-results page.

The SHA-256 checksum is published beside the ZIP. This project does not distribute a `.crx` file because unpacked extensions are auditable and do not depend on Chrome Web Store signing.

## Use

1. Run a publications search in MathSciNet.
2. Click the 48 px floating button in the lower-right corner.
3. Select **Export all**. The task continues even when the panel is collapsed.
4. Keep the tab open and avoid manually changing the query or page while the export is running.
5. Chrome downloads one deduplicated `.bib` file when the collected count matches MathSciNet's live total.

If a site change or network interruption stops the task, use **Download collected** to preserve the records already captured.

## Language

Click the extension icon in Chrome's toolbar and choose:

- **Auto** — Simplified Chinese for Chinese browser locales, English otherwise.
- **中文** — always use Simplified Chinese.
- **English** — always use English.

An open MathSciNet panel updates immediately. Page number, collected records, progress, and task state are not reset.

## Privacy and permissions

- `storage`: stores export progress and the language preference in Chrome's local extension storage.
- `clipboardRead`: reads BibTeX only when MathSciNet exposes generated citations through its copy control.
- Site access is limited to `mathscinet.ams.org` and the University of Nottingham EZproxy host.
- No analytics, tracking, external fonts, or third-party network services are used.

## Troubleshooting

- Make sure you downloaded the named Release asset instead of the Source code archive.
- After updating the extension, click **Reload** on `chrome://extensions` and refresh MathSciNet.
- Keep MathSciNet's result page open during an export.
- If pagination or result counts no longer match, stop rather than clicking controls manually; the panel retains partial records for download.

## Development

```bash
git clone https://github.com/0neblaze/mathscinet-bibtex-exporter.git
cd mathscinet-bibtex-exporter
npm test
npm run check
npm run package
```

Load [`extension/`](extension/) directly for source-based testing. Reproducible Release assets are written to the ignored `dist/` directory.

## Supported sites

- `https://mathscinet.ams.org/`
- University of Nottingham EZproxy for MathSciNet

## Contributing and security

Issues and pull requests are welcome in English or Chinese. See [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a change. Please report security concerns according to [SECURITY.md](SECURITY.md).

Released under the [MIT License](LICENSE).
