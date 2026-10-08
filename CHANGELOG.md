# Changelog

## [0.5.3](https://github.com/quokkify/allure-report-action/compare/v0.5.2...v0.5.3) (2026-10-08)


### 📦 Dependencies

* **github-actions:** update actions/download-artifact action to v8.0.2 ([#135](https://github.com/quokkify/allure-report-action/issues/135)) ([a55374b](https://github.com/quokkify/allure-report-action/commit/a55374b4b633f7f3c7bff76d00107e2cba3fb26d))

## [0.5.2](https://github.com/quokkify/allure-report-action/compare/v0.5.1...v0.5.2) (2026-09-28)

<!-- project-toolkit:rich-block:start -->
### 📦 Dependencies
- update eslint to v10 ([#38](https://github.com/quokkify/allure-report-action/pull/38)) ([c4c2ac2](https://github.com/quokkify/allure-report-action/commit/c4c2ac2a1a04260fc8df8a6e4d2585085422ef28)) <!-- project-toolkit:rich-release-notes pr=38 -->
- lock file maintenance ([#95](https://github.com/quokkify/allure-report-action/pull/95)) ([89c3174](https://github.com/quokkify/allure-report-action/commit/89c3174831661ae9ccdf32929c18b652c3d5ef64)) <!-- project-toolkit:rich-release-notes pr=95 -->
- update typescript-eslint monorepo to v8.70.1 ([#99](https://github.com/quokkify/allure-report-action/pull/99)) ([38bf880](https://github.com/quokkify/allure-report-action/commit/38bf880e0192b42d4d82bd5eb89468fc363e9ef2)) <!-- project-toolkit:rich-release-notes pr=99 -->
- update prettier to v3.9.9 ([#93](https://github.com/quokkify/allure-report-action/pull/93) ([fa9b1c3](https://github.com/quokkify/allure-report-action/commit/fa9b1c354460ddc15466e501bcb3fb51f88b918b)), [#94](https://github.com/quokkify/allure-report-action/pull/94) ([7610c03](https://github.com/quokkify/allure-report-action/commit/7610c03953ffa3bba19723baf4f63b726e5c6a18)), [#101](https://github.com/quokkify/allure-report-action/pull/101) ([b9dfaf1](https://github.com/quokkify/allure-report-action/commit/b9dfaf190b08b078266fd9aa82a41af3284a6b5b))) <!-- project-toolkit:rich-release-notes pr=93 --> <!-- project-toolkit:rich-release-notes pr=94 --> <!-- project-toolkit:rich-release-notes pr=101 -->
- lock file maintenance ([#102](https://github.com/quokkify/allure-report-action/pull/102)) ([76f6457](https://github.com/quokkify/allure-report-action/commit/76f64572a4dcc8ffe99908cd89cf6722d564cd07)) <!-- project-toolkit:rich-release-notes pr=102 -->
- update vitest to v5.0.2 ([#90](https://github.com/quokkify/allure-report-action/pull/90) ([d7c882f](https://github.com/quokkify/allure-report-action/commit/d7c882fd1fdb3ecf04ae2785e5af6df71a337206)), [#104](https://github.com/quokkify/allure-report-action/pull/104) ([6d31a30](https://github.com/quokkify/allure-report-action/commit/6d31a30a794998b84d49ce0aa7ec56963e771e00))) <!-- project-toolkit:rich-release-notes pr=90 --> <!-- project-toolkit:rich-release-notes pr=104 -->
- update @allurereport/ci to v3.19.0 ([#109](https://github.com/quokkify/allure-report-action/pull/109) ([b9c3faa](https://github.com/quokkify/allure-report-action/commit/b9c3faaf5e1be0e21a6e1bd7e96dc05bdd2c5f0e))) <!-- project-toolkit:rich-release-notes pr=109 -->
- update @types/node to v24.19.0 ([#91](https://github.com/quokkify/allure-report-action/pull/91) ([61e515d](https://github.com/quokkify/allure-report-action/commit/61e515df074371535121ec9c777d6df59c95e492)), [#98](https://github.com/quokkify/allure-report-action/pull/98) ([42e6575](https://github.com/quokkify/allure-report-action/commit/42e6575a9208fe01361848f0cac1a506ce7bd5cf)), [#110](https://github.com/quokkify/allure-report-action/pull/110) ([a58f4da](https://github.com/quokkify/allure-report-action/commit/a58f4da7f560eddfe816aaad87ae28aaf74a8cd3))) <!-- project-toolkit:rich-release-notes pr=91 --> <!-- project-toolkit:rich-release-notes pr=98 --> <!-- project-toolkit:rich-release-notes pr=110 -->
- update allure to v3.19.0 ([#97](https://github.com/quokkify/allure-report-action/pull/97) ([172cba4](https://github.com/quokkify/allure-report-action/commit/172cba421bf308f7a7f092ed92150055dfb970ca)), [#111](https://github.com/quokkify/allure-report-action/pull/111) ([88696c3](https://github.com/quokkify/allure-report-action/commit/88696c316cb407e4ddf1417439a161e004fc652f))) <!-- project-toolkit:rich-release-notes pr=97 --> <!-- project-toolkit:rich-release-notes pr=111 -->
- update allure-vitest to v3.13.0 ([#92](https://github.com/quokkify/allure-report-action/pull/92) ([408ab96](https://github.com/quokkify/allure-report-action/commit/408ab9641105a36c2941ce8bfa9ce173aaf2da15)), [#112](https://github.com/quokkify/allure-report-action/pull/112) ([06a2f58](https://github.com/quokkify/allure-report-action/commit/06a2f58d193ecd72029454334b8e5d3db4d12591))) <!-- project-toolkit:rich-release-notes pr=92 --> <!-- project-toolkit:rich-release-notes pr=112 -->
<!-- project-toolkit:rich-release-notes pr=103 -->
#### refactor: delegate PR summaries to upstream Allure CI
### Migration
Existing workflow inputs and outputs remain available. The standard comment changes to the upstream layout; the custom pass-rate heading and `Tests by layer` table are removed. Optional badges/pyramid outputs remain separate and retain their raw-result semantics.

Standalone `pr-body` now requires generated Allure 3 plugin summaries and fails clearly when they are missing. `--results` remains accepted but no longer supplies comment statistics. The bundled CI library and default CLI version are 3.18.0; other CLI versions must emit compatible report metadata.

Blast radius: repositories adopting a new release/SHA of `quokkify/allure-report-action`; existing immutable pins are unaffected. This draft PR is the canary for the generated-report-to-comment integration. No release or merge is performed.

<!-- project-toolkit:rich-release-notes pr=105 -->
#### fix: restore config-driven releases and refactor notes
### Migration
Existing workflow mode stays single; no temporary manifest-mode workaround is required. Root releases keep componentless tags. Chore/deps commits remain hidden according to template policy.
<!-- project-toolkit:rich-block:end -->

### 🐛 Bug Fixes

* **release:** sync dependency compaction helper ([#108](https://github.com/quokkify/allure-report-action/issues/108)) ([edc86b3](https://github.com/quokkify/allure-report-action/commit/edc86b3303e4a9109b33cb391706b418db9aa5d0))
* restore config-driven releases and refactor notes ([#105](https://github.com/quokkify/allure-report-action/issues/105)) ([8182e74](https://github.com/quokkify/allure-report-action/commit/8182e744ab8168296b01ba6165bdfcf3f638f524))


### ♻️ Refactoring

* delegate PR summaries to upstream Allure CI ([#103](https://github.com/quokkify/allure-report-action/issues/103)) ([807fe83](https://github.com/quokkify/allure-report-action/commit/807fe8339a1ab0025e9a32bd4b04bfe9407481e4))

## [0.5.1](https://github.com/quokkify/allure-report-action/compare/v0.5.0...v0.5.1) (2026-09-18)


### Bug Fixes

* **allure:** deduplicate environment variables ([#87](https://github.com/quokkify/allure-report-action/issues/87)) ([280bd6b](https://github.com/quokkify/allure-report-action/commit/280bd6b31178c38362d00f7a998633da73d19c66))

## [0.5.0](https://github.com/quokkify/allure-report-action/compare/v0.4.1...v0.5.0) (2026-09-18)

<!-- project-toolkit:rich-block:start -->
### 📦 Dependencies
- update vitest to v4 ([#49](https://github.com/quokkify/allure-report-action/pull/49)) ([59badb2](https://github.com/quokkify/allure-report-action/commit/59badb2c22d2c26a958e2abf41a0791c95476526)) <!-- project-toolkit:rich-release-notes pr=49 -->
- update esbuild to ^0.28.0 ([#57](https://github.com/quokkify/allure-report-action/pull/57)) ([672ac42](https://github.com/quokkify/allure-report-action/commit/672ac42f158251528e3c278ea9d3deb0d870de15)) <!-- project-toolkit:rich-release-notes pr=57 -->
- update @types/node to v24 ([#58](https://github.com/quokkify/allure-report-action/pull/58)) ([a3c4ba5](https://github.com/quokkify/allure-report-action/commit/a3c4ba5d7de4aa5fca2dce78781bf124a784b3f5)) <!-- project-toolkit:rich-release-notes pr=58 -->
- update @octokit/core to v7.0.8 ([#69](https://github.com/quokkify/allure-report-action/pull/69)) ([48a6152](https://github.com/quokkify/allure-report-action/commit/48a6152b53d50cfb88253bfae72dcf5e0c136b84)) <!-- project-toolkit:rich-release-notes pr=69 -->
- update typescript-eslint monorepo to ^8.68.0 ([#70](https://github.com/quokkify/allure-report-action/pull/70)) ([b0a5fe6](https://github.com/quokkify/allure-report-action/commit/b0a5fe66a6b3ffd02b2eb992dd61967a0fb56010)) <!-- project-toolkit:rich-release-notes pr=70 -->
- update allure to v3.16.1 ([#73](https://github.com/quokkify/allure-report-action/pull/73)) ([2ec1ebd](https://github.com/quokkify/allure-report-action/commit/2ec1ebd82ac5c299bff154ebdf2b60090f6803bc)) <!-- project-toolkit:rich-release-notes pr=73 -->
- update typescript-eslint monorepo to ^8.69.0 ([#75](https://github.com/quokkify/allure-report-action/pull/75)) ([ed85ace](https://github.com/quokkify/allure-report-action/commit/ed85acedb4c3c8a2a9add12183f14f5c9158505e)) <!-- project-toolkit:rich-release-notes pr=75 -->
- pin dependencies ([#76](https://github.com/quokkify/allure-report-action/pull/76)) ([e88f807](https://github.com/quokkify/allure-report-action/commit/e88f8075f82994ca7c19f6c45dfadc3a9f3a5516)) <!-- project-toolkit:rich-release-notes pr=76 -->
- update @types/node to v24.13.4 ([#77](https://github.com/quokkify/allure-report-action/pull/77)) ([a67ac12](https://github.com/quokkify/allure-report-action/commit/a67ac126eb28133e5a6ac2512361545a1d0ab640)) <!-- project-toolkit:rich-release-notes pr=77 -->
- update allure to v3.17.0 ([#78](https://github.com/quokkify/allure-report-action/pull/78)) ([b67ceb4](https://github.com/quokkify/allure-report-action/commit/b67ceb4c9f74d01dec89b070e1c14d532476686a)) <!-- project-toolkit:rich-release-notes pr=78 -->
- update vitest to v5 ([#79](https://github.com/quokkify/allure-report-action/pull/79)) ([be6912f](https://github.com/quokkify/allure-report-action/commit/be6912fabc13e44ac8667213011f68662c8a8fa9)) <!-- project-toolkit:rich-release-notes pr=79 -->
- update allure-vitest to v3.12.1 ([#81](https://github.com/quokkify/allure-report-action/pull/81)) ([f834ac2](https://github.com/quokkify/allure-report-action/commit/f834ac2cd23b17c0e4cf2a05a252145b689221ed)) <!-- project-toolkit:rich-release-notes pr=81 -->
<!-- project-toolkit:rich-block:end -->

### Features

* **allure:** scope provenance by environment and module ([#84](https://github.com/quokkify/allure-report-action/issues/84)) ([78b4b36](https://github.com/quokkify/allure-report-action/commit/78b4b3615d60d59c4311bdad21242522c5366079))


### Bug Fixes

* keep top-level environments by provenance ([#86](https://github.com/quokkify/allure-report-action/issues/86)) ([7fe5bb6](https://github.com/quokkify/allure-report-action/commit/7fe5bb667e1dda74f23c7edf1535e3a9c29f7856))

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
