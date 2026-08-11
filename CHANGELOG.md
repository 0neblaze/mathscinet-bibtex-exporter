# Changelog

All notable changes to this project are documented in this file.

## [0.4.0] - 2026-08-12

### Added

- Shared `12px` surface corners, `9px` control corners, and restrained `220ms` motion tokens.
- A sliding language-selection indicator synchronized with persisted popup state.
- Reduced-motion support for the popup, floating launcher, export panel, badges, and progress updates.

### Changed

- Filled Chrome's native popup surface edge to edge, with fixed bilingual geometry and rounded internal cards.
- Limited language-switch motion to the sliding selection indicator so translated copy never shifts the layout.
- Replaced instant panel hiding with accessible bidirectional transitions using `data-expanded`, `aria-hidden`, and `inert`.
- Smoothed launcher, status, badge, button, and progress feedback without interrupting active export tasks.

## [0.3.0] - 2026-08-12

### Added

- Compact Chrome toolbar popup for `Auto / 中文 / English` language settings.
- Shared runtime i18n dictionaries with strict key-parity and interpolation tests.
- Localized extension metadata and custom toolbar icons.
- Live language synchronization between the popup and open MathSciNet tabs.
- English-first and Simplified Chinese README documentation.
- GitHub CI and tag-driven Release automation.

### Changed

- Restyled the floating launcher and export panel with MathSciNet-inspired blue, orange, and white visuals.
- Represented progress, success, recovery, and error states as translatable message keys and parameters.
- Expanded the reproducible Release ZIP to include popup, locale, i18n, and icon assets.
- Organized runtime files under `extension/` and tests under `tests/`.

## [0.2.0] - 2026-08-12

### Added

- Collapsed floating launcher with progress and outcome indicators.
- Interaction regression tests for automatic export preparation and scoped pagination.
- Reproducible ZIP packaging with a SHA-256 checksum.

### Fixed

- Open MathSciNet's Export controls automatically before selecting records.
- Detect visible records while the Export controls are still collapsed.
- Restrict First and Next navigation to the active search-results paginator.
- Match citation-output close controls exactly so author names such as `Cardone` are never clicked as `Done`.
- Count only primary result links so related MR references cannot block page-stability checks.
- Continue directly to result pages beyond MathSciNet's disabled 1,000-record paginator and resume automatically after navigation.
- Wait for SPA result metadata before resuming a direct page, and retry pending pages after transient resume errors.
- Normalize page-size changes in search identity and retain pending-page markers until URL and cumulative-count validation succeeds.

## [0.1.0] - 2026-08-12

- Initial local Chrome extension for batched MathSciNet BibTeX export.
