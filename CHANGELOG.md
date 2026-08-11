# Changelog

All notable changes to this project are documented in this file.

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
