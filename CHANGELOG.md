# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-06-20

### Added

- Warn (to stderr) when a referenced `{env:VAR}` has no matching Keychain
  entry, including the exact `security add-generic-password` command to fix it.
- `LICENSE` file (MIT).
- `engines` field: Node `>=18`, Bun `>=1.3.13`.

### Changed

- Reworked the README for clarity (why, install, secrets, how-it-works).
- Releasing is now triggered only by pushing a `v*` git tag.
- Publishing uses npm OIDC trusted publishing instead of an `NPM_TOKEN`
  secret (`bun publish` does not support OIDC).
- Pinned GitHub Actions to exact patch versions and pinned the Bun version
  used in CI (bump manually).
- Added a 7-day dependency cooldown via Dependabot and a 7-day
  `minimumReleaseAge` freeze in `bunfig.toml`.

## [0.1.0] - 2026-06-20

### Added

- Initial release: OpenCode plugin to load provider secrets from the macOS Keychain.
- Keychain convention: `service = ENV_VAR_NAME`, `account = $USER`.

[Unreleased]: https://github.com/tiansuyu/opencode-plugin-keychain/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/tiansuyu/opencode-plugin-keychain/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/tiansuyu/opencode-plugin-keychain/releases/tag/v0.1.0
