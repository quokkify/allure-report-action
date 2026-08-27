# Changelog

## [0.4.1](https://github.com/quokkify/allure-report-action/compare/v0.4.0...v0.4.1) (2026-08-27)


### Bug Fixes

* **deps:** update @actions/github to v9 ([#45](https://github.com/quokkify/allure-report-action/issues/45)) ([60dfa82](https://github.com/quokkify/allure-report-action/commit/60dfa82729b680fcb965f6250e34d5226e94d45c))
* **deps:** update @octokit/core to v7 ([#46](https://github.com/quokkify/allure-report-action/issues/46)) ([46da3f6](https://github.com/quokkify/allure-report-action/commit/46da3f67b4827bad0d3af57715fd251dec319a05))
* **deps:** update @octokit/plugin-paginate-rest to v12 ([#41](https://github.com/quokkify/allure-report-action/issues/41)) ([517cbc9](https://github.com/quokkify/allure-report-action/commit/517cbc9b2ff15f50753df604e5a5d2b6602cdee9))
* **deps:** update @octokit/plugin-paginate-rest to v14 ([#43](https://github.com/quokkify/allure-report-action/issues/43)) ([88e1ff8](https://github.com/quokkify/allure-report-action/commit/88e1ff8da41679a6390330f75aeb8cf5117442c4))
* **deps:** update @octokit/plugin-paginate-rest to v15 ([#47](https://github.com/quokkify/allure-report-action/issues/47)) ([f98043b](https://github.com/quokkify/allure-report-action/commit/f98043b2ecd2fcbb854b2a1e3d11192e975f4239))
* **deps:** update @octokit/plugin-rest-endpoint-methods to v16 ([#42](https://github.com/quokkify/allure-report-action/issues/42)) ([20a1e06](https://github.com/quokkify/allure-report-action/commit/20a1e06b6493a3feccdc752b5110708f5d49c126))
* **deps:** update @octokit/plugin-rest-endpoint-methods to v17 ([#48](https://github.com/quokkify/allure-report-action/issues/48)) ([d6e8e25](https://github.com/quokkify/allure-report-action/commit/d6e8e25e609786b017169f30099078e51dd7fb39))
* **deps:** update @octokit/plugin-rest-endpoint-methods to v18 ([#51](https://github.com/quokkify/allure-report-action/issues/51)) ([d3fb18e](https://github.com/quokkify/allure-report-action/commit/d3fb18e6f3702d1c54514487fb5c09a0e0aef2b2))
* ensure valid start/stop timestamps to prevent plugin-awesome duration chart errors ([#52](https://github.com/quokkify/allure-report-action/issues/52)) ([73275e6](https://github.com/quokkify/allure-report-action/commit/73275e6e99d815b2f73af830f9b540e451dba75c))

## [0.4.0](https://github.com/quokkify/allure-report-action/compare/v0.3.0...v0.4.0) (2026-08-27)


### Features

* migrate from Bash to TypeScript ([#33](https://github.com/quokkify/allure-report-action/issues/33)) ([542a5ee](https://github.com/quokkify/allure-report-action/commit/542a5ee9f3fd0a9b9862c7aa1514e9953b12dce5))

## [0.3.0](https://github.com/quokkify/allure-report-action/compare/v0.2.3...v0.3.0) (2026-08-25)


### Features

* compact allure report comment ([c0e9591](https://github.com/quokkify/allure-report-action/commit/c0e9591858d70514de98cbe293f3d7b319b379e2))

## [0.2.3](https://github.com/quokkify/allure-report-action/compare/v0.2.2...v0.2.3) (2026-08-11)


### Bug Fixes

* scope environment variables by provenance ([#19](https://github.com/quokkify/allure-report-action/issues/19)) ([8b732a2](https://github.com/quokkify/allure-report-action/commit/8b732a2b201a92e97fed3aa7e98f6008b458c8ce))

## [0.2.2](https://github.com/quokkify/allure-report-action/compare/v0.2.1...v0.2.2) (2026-08-08)


### Bug Fixes

* preserve sidecar environment variables ([#17](https://github.com/quokkify/allure-report-action/issues/17)) ([f59bfef](https://github.com/quokkify/allure-report-action/commit/f59bfeff135bb07e63a3e7a1b86e810a0efaddd2))

## [0.2.1](https://github.com/quokkify/allure-report-action/compare/v0.2.0...v0.2.1) (2026-08-06)


### Bug Fixes

* own provenance-aware result merging ([#15](https://github.com/quokkify/allure-report-action/issues/15)) ([c513031](https://github.com/quokkify/allure-report-action/commit/c513031cb4d2970a5cb73172135bca3a127e08e2))
* recover module labels from result provenance ([#13](https://github.com/quokkify/allure-report-action/issues/13)) ([654694b](https://github.com/quokkify/allure-report-action/commit/654694be3620dcbc03bcb5dbd9b41d5078abb759))

## [0.2.0](https://github.com/quokkify/allure-report-action/compare/v0.1.3...v0.2.0) (2026-08-06)


### Features

* improve Allure report attribution and environments ([#11](https://github.com/quokkify/allure-report-action/issues/11)) ([925bb96](https://github.com/quokkify/allure-report-action/commit/925bb969889752bb4bcf0de2bbe3216c398ff058))

## [0.1.3](https://github.com/quokkify/allure-report-action/compare/v0.1.2...v0.1.3) (2026-08-03)


### Bug Fixes

* **ci:** align Copier template baseline ([#10](https://github.com/quokkify/allure-report-action/issues/10)) ([3f5aef9](https://github.com/quokkify/allure-report-action/commit/3f5aef999dac01c5bbd1cd664f01eb2117a8e4d4))
* use Renovate-compatible Copier source URL ([#8](https://github.com/quokkify/allure-report-action/issues/8)) ([29d2818](https://github.com/quokkify/allure-report-action/commit/29d281868664ea299adba1ac6678fe5b7ffd519b))

## [0.1.2](https://github.com/quokkify/allure-report-action/compare/v0.1.1...v0.1.2) (2026-08-02)


### Bug Fixes

* support installation token comment authors ([#5](https://github.com/quokkify/allure-report-action/issues/5)) ([db373d5](https://github.com/quokkify/allure-report-action/commit/db373d5bc896cf64fce3b43d0781bf4a899fa473))

## [0.1.1](https://github.com/quokkify/allure-report-action/compare/v0.1.0...v0.1.1) (2026-08-02)


### Bug Fixes

* protect comment ownership during upsert ([#3](https://github.com/quokkify/allure-report-action/issues/3)) ([f40bf4e](https://github.com/quokkify/allure-report-action/commit/f40bf4e0302b711a965821e2b9a4ac5ca4e48776))

## 0.1.0 (2026-08-02)


### Features

* add Allure report action ([#1](https://github.com/quokkify/allure-report-action/issues/1)) ([f50c5e9](https://github.com/quokkify/allure-report-action/commit/f50c5e9e202e5dd54fb95f80e7fc51a70b39cc2b))
