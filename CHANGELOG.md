# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [2.3.5](https://github.com/gleegs/arcend-launcher-v2/compare/v2.3.4...v2.3.5) (2026-07-10)

### Bug Fixes

- **arc:** retry packwiz on transient network timeouts ([6f127ba](https://github.com/gleegs/arcend-launcher-v2/commit/6f127bae3a86a709db8bf3dadee5b6e7b0305d43))

### [2.3.4](https://github.com/gleegs/arcend-launcher-v2/compare/v2.3.3...v2.3.4) (2026-07-10)

### Bug Fixes

- **auth:** keep login button size, show error below it ([a802b6d](https://github.com/gleegs/arcend-launcher-v2/commit/a802b6d2ed0c498ed6f64cce97e7c102002470ba))

### [2.3.3](https://github.com/gleegs/arcend-launcher-v2/compare/v2.3.2...v2.3.3) (2026-07-10)

### Bug Fixes

- **auth:** isolate Microsoft login session and surface login failures ([c8403b4](https://github.com/gleegs/arcend-launcher-v2/commit/c8403b4ef5e0dd0b1fe8b6f8661766d5e5ac0ce8))

### [2.3.2](https://github.com/gleegs/arcend-launcher-v2/compare/v2.3.1...v2.3.2) (2026-07-09)

### Features

- **arc:** support local pack.toml via ARCEND_PACK_TOML_URL in dev ([01e7e54](https://github.com/gleegs/arcend-launcher-v2/commit/01e7e544dbffa90ac02ca210493b1be186a0afe2))
- **build:** add appImage build ([#61](https://github.com/gleegs/arcend-launcher-v2/issues/61)) ([05f6eb8](https://github.com/gleegs/arcend-launcher-v2/commit/05f6eb805306cc659af4a0e0721aa695e937d038))

### Bug Fixes

- **java:** flatten macOS bundle layout so bin/java resolves ([aed9773](https://github.com/gleegs/arcend-launcher-v2/commit/aed9773613814dfef02b57436bbcd0d5d1547785))
- **java:** resolve macOS modpack install crash ([#60](https://github.com/gleegs/arcend-launcher-v2/issues/60)) ([3de8b3a](https://github.com/gleegs/arcend-launcher-v2/commit/3de8b3a31fe88d5cf2004d07384c64f2dda957a3))
- **java:** resolve macOS modpack install crash at Java step ([e77bdfe](https://github.com/gleegs/arcend-launcher-v2/commit/e77bdfe53baa91fe81013ff9714aa6f3998d2dd5))
- **java:** use aarch64 for Adoptium API on Apple Silicon ([e93681a](https://github.com/gleegs/arcend-launcher-v2/commit/e93681a999fd9946f593059ad61c8a96aad8f06b))

### [2.3.1](https://github.com/gleegs/arcend-launcher-v2/compare/v2.3.0...v2.3.1) (2026-06-30)

### Features

- cancellable launch + logs cursor polish ([8acb885](https://github.com/gleegs/arcend-launcher-v2/commit/8acb8857b18d05af46987b0a4c5885c58ca59182))
- **server:** display live server status and player count ([db9265d](https://github.com/gleegs/arcend-launcher-v2/commit/db9265d4be914cd22873bae076a43339821c1555))
- **server:** display live server status and player count ([#59](https://github.com/gleegs/arcend-launcher-v2/issues/59)) ([b828a3e](https://github.com/gleegs/arcend-launcher-v2/commit/b828a3e5dd07f9c0bb2328c2a11c928928e47c00))

## [2.3.0](https://github.com/gleegs/arcend-launcher-v2/compare/v2.2.1...v2.3.0) (2026-06-26)

### Features

- log panel improvements, packwiz log surfacing, UI polish ([4b74048](https://github.com/gleegs/arcend-launcher-v2/commit/4b740486cd0d5b00b87580310be6d665943b581e))

### [2.2.1](https://github.com/gleegs/arcend-launcher-v2/compare/v2.2.0...v2.2.1) (2026-06-25)

### Bug Fixes

- account skin head by username + dev-mode label ([#58](https://github.com/gleegs/arcend-launcher-v2/issues/58)) ([e5ff8f5](https://github.com/gleegs/arcend-launcher-v2/commit/e5ff8f575c02bcfe1caee59b9071435d54964469))

## [2.2.0](https://github.com/gleegs/arcend-launcher-v2/compare/v2.1.1...v2.2.0) (2026-06-24)

### Features

- **auth:** require click-to-confirm before logout ([1bf7fc1](https://github.com/gleegs/arcend-launcher-v2/commit/1bf7fc1bab3605c3ea5580a6e04a6c1ca834f54f))
- **ui:** add black hover border to the play menu kebab button ([7ae7cf7](https://github.com/gleegs/arcend-launcher-v2/commit/7ae7cf787cb1c8aaf7af2045750acb2a0137085a))
- **ui:** add bottom-left info panel and remove launcher console ([386547c](https://github.com/gleegs/arcend-launcher-v2/commit/386547c136fb5f2d25f2096bef96b4b4e29dcb71))
- **ui:** add notebook-pen icon to the propose-arc button ([26c3ef8](https://github.com/gleegs/arcend-launcher-v2/commit/26c3ef84fee9f8f00e2c47e4dc0e86d75e5d73be))
- **ui:** add proposal arc variant (arc-undefined) ([025f27d](https://github.com/gleegs/arcend-launcher-v2/commit/025f27dacdc53b97e95686bd29724f01d3adc561))
- **ui:** add selected-arc connector tab in the sidebar gap ([a84718a](https://github.com/gleegs/arcend-launcher-v2/commit/a84718a82fda9aced8a7d0568db01be6e79716de))
- **ui:** add server/article/logs info panel in the bottom-left ([a662e7f](https://github.com/gleegs/arcend-launcher-v2/commit/a662e7f78a02db197aa17038588e52d00f271374))
- **ui:** add white hover border to the play menu kebab circle ([e3d8f0c](https://github.com/gleegs/arcend-launcher-v2/commit/e3d8f0c522c95ed8af19fad3b8164016f5e53ef5))
- **ui:** adjust time-of-day cover ranges ([55d1d12](https://github.com/gleegs/arcend-launcher-v2/commit/55d1d12fd600233d25a93e3e6f94455fa5bd3c57))
- **ui:** animate dropdown menu open/close with a transition ([3686b86](https://github.com/gleegs/arcend-launcher-v2/commit/3686b8688291013788cde441b7cbf0e12268a42a))
- **ui:** auto-scroll logs tab to bottom on new entries ([94872a1](https://github.com/gleegs/arcend-launcher-v2/commit/94872a15b53b0a792768bb7d6627045151f0a176))
- **ui:** auto-switch hero cover at time-of-day boundaries ([76038c9](https://github.com/gleegs/arcend-launcher-v2/commit/76038c99f4fa9897810875bbe05fc2b81deed4ba))
- **ui:** cross-fade the hero background between covers ([3e34ba1](https://github.com/gleegs/arcend-launcher-v2/commit/3e34ba18d81103d8b9538cb140539fd757e99be8))
- **ui:** default info panel to the latest-article tab ([14a5438](https://github.com/gleegs/arcend-launcher-v2/commit/14a543893d272235005455ff4f64795954fddc83))
- **ui:** give play button and kebab independent hover states ([4a8e578](https://github.com/gleegs/arcend-launcher-v2/commit/4a8e57892cb8d6f7d04de1e4e39bfbcabe4f170b))
- **ui:** link version badge to the changelog page ([b1d6eb5](https://github.com/gleegs/arcend-launcher-v2/commit/b1d6eb581e3871a622097997539220655f186c26))
- **ui:** point propose-arc button to the Discord channel ([7882d1d](https://github.com/gleegs/arcend-launcher-v2/commit/7882d1d0e13dc489fb9dd4d5e505fc26bdbcfed5))
- **ui:** position play menu kebab absolutely over the play button ([c88b0f5](https://github.com/gleegs/arcend-launcher-v2/commit/c88b0f5c6b1c66bcccccd558c89ab9855cdfc2bb))
- **ui:** proposal arc shows only the latest-article tab ([d0bf8f7](https://github.com/gleegs/arcend-launcher-v2/commit/d0bf8f75fa986d7c78d932e199640cb29c34540b))
- **ui:** rework install progress bar layout and route mods to logs ([6352f39](https://github.com/gleegs/arcend-launcher-v2/commit/6352f398140e4f39b352ff2d09f708d14c7cb2a7))
- **ui:** select hero cover based on time of day ([7bc7bab](https://github.com/gleegs/arcend-launcher-v2/commit/7bc7babd3ff2341d1955bcfcb23df31bb8e0e392))
- **ui:** show play menu kebab as a white circle inside the play button ([db8e707](https://github.com/gleegs/arcend-launcher-v2/commit/db8e7075dac95ecf382f05908b89a25e3f726dbd))
- **ui:** show play menu kebab as a white circle inside the play button ([9aab8a1](https://github.com/gleegs/arcend-launcher-v2/commit/9aab8a1874ca16c3b2d63fce6879ef7be4bbfc2f))
- **ui:** slide the selected-arc connector between arcs ([f27e67f](https://github.com/gleegs/arcend-launcher-v2/commit/f27e67fe1c7d0e45cd910b12c8a3725d00113c0d))
- **ui:** use per-arc logo from Supabase logo_url ([4ddf157](https://github.com/gleegs/arcend-launcher-v2/commit/4ddf157fa46be35a2bd7b6de31bad4724bbb557f))
- **window:** custom JS window dragging to allow custom cursor ([d3e7623](https://github.com/gleegs/arcend-launcher-v2/commit/d3e7623c45fc16cab59a48885793c795a6949dfc))

### Bug Fixes

- **auth:** don't arm logout confirm on the post-login activation click ([ad6979e](https://github.com/gleegs/arcend-launcher-v2/commit/ad6979e43d121b7cc0ef35c6b13677724c022a5c))
- **auth:** gate logout confirm on real hover ([ec7bb0f](https://github.com/gleegs/arcend-launcher-v2/commit/ec7bb0f73a11f1fa1ec0f320aff2f7adfe0d61d9))
- **config:** load .env file for Supabase keys via Vite loadEnv ([ed3ba3b](https://github.com/gleegs/arcend-launcher-v2/commit/ed3ba3b51fbab472b01e9ab95c7fb22ba2f2df21))
- **images:** revalidate cached images in the background ([01ff2c1](https://github.com/gleegs/arcend-launcher-v2/commit/01ff2c1ae671376f9e9bc173d27a325089280869))
- **ui:** use correct proposal arc slug (arcend-undefined) ([a414f83](https://github.com/gleegs/arcend-launcher-v2/commit/a414f8321c8494e35c074d0f220fa440449bba65))
- **window:** prevent image/text selection while dragging the window ([a7e549d](https://github.com/gleegs/arcend-launcher-v2/commit/a7e549dae8292ea6274d7159aa383a17c8326177))

### [2.1.1](https://github.com/gleegs/arcend-launcher-v2/compare/v2.1.0...v2.1.1) (2026-06-21)

### Bug Fixes

- **ui:** make social buttons clickable ([#53](https://github.com/gleegs/arcend-launcher-v2/issues/53)) ([3698307](https://github.com/gleegs/arcend-launcher-v2/commit/3698307bb89e4cb2a823b45a41c191602beb758c))
- **ui:** use dynamic app version in settings panel ([#54](https://github.com/gleegs/arcend-launcher-v2/issues/54)) ([4b1c2b1](https://github.com/gleegs/arcend-launcher-v2/commit/4b1c2b1385bc6accb1be6ca5b0495d826b8be9f6))

## [2.1.0](https://github.com/gleegs/arcend-launcher-v2/compare/v2.0.0...v2.1.0) (2026-06-20)

### Features

- **ui:** add clickable logo with cover cycling in main view ([#52](https://github.com/gleegs/arcend-launcher-v2/issues/52)) ([37de931](https://github.com/gleegs/arcend-launcher-v2/commit/37de931bbd8106a57f15852883f6a44b4971bec7))
- **ui:** remove server status indicator from sidebar ([#51](https://github.com/gleegs/arcend-launcher-v2/issues/51)) ([c0f71dd](https://github.com/gleegs/arcend-launcher-v2/commit/c0f71dd5744d9baf32b03b2995141bce190ecc99))

## [2.0.0](https://github.com/gleegs/arcend-launcher-v2/compare/v2.0.0-beta.3...v2.0.0) (2026-06-20)

### Features

- **console:** add game console UI with live logs ([#48](https://github.com/gleegs/arcend-launcher-v2/issues/48)) ([78c4460](https://github.com/gleegs/arcend-launcher-v2/commit/78c4460d053f55f992ffcfac341f13e2d86c7bd1))
- **ui:** add discord and website social buttons ([#47](https://github.com/gleegs/arcend-launcher-v2/issues/47)) ([53e76c7](https://github.com/gleegs/arcend-launcher-v2/commit/53e76c7a39c87a0f16cb664d1b34be040a58e9b0))
- **ui:** add kebab menu next to play button ([#49](https://github.com/gleegs/arcend-launcher-v2/issues/49)) ([b4a18bc](https://github.com/gleegs/arcend-launcher-v2/commit/b4a18bcb94b64b64b561c92d6b7f82f6f4e56dc7))

### Bug Fixes

- **server:** fix serveur status ([#44](https://github.com/gleegs/arcend-launcher-v2/issues/44)) ([77390d9](https://github.com/gleegs/arcend-launcher-v2/commit/77390d902298120526622badb4adc87e33f460fb))
- **ui:** add arc button background ([#45](https://github.com/gleegs/arcend-launcher-v2/issues/45)) ([64d670a](https://github.com/gleegs/arcend-launcher-v2/commit/64d670a5b58fee807f2ea296f0336936b90035df))
- **ui:** make hidden settings panels non-focusable when closed ([#50](https://github.com/gleegs/arcend-launcher-v2/issues/50)) ([88680ff](https://github.com/gleegs/arcend-launcher-v2/commit/88680ff3f3af18a1defb4c02b3973ca027136f92))

## [2.0.0-beta.3](https://github.com/gleegs/arcend-launcher-v2/compare/v2.0.0-beta.2...v2.0.0-beta.3) (2026-06-18)

### Features

- **ui:** add progress bars for installation and launch phases ([#43](https://github.com/gleegs/arcend-launcher-v2/issues/43)) ([443fd24](https://github.com/gleegs/arcend-launcher-v2/commit/443fd24bfc178c01591c6b53b7ef2b24758ff255))

## [2.0.0-beta.2](https://github.com/gleegs/arcend-launcher-v2/compare/v2.0.0-beta.1...v2.0.0-beta.2) (2026-06-17)

### Features

- **app:** add app and setup icon ([948e222](https://github.com/gleegs/arcend-launcher-v2/commit/948e222871be853ec83bd711d4d015e9f6a373b1))
- **app:** add app and setup icon ([#37](https://github.com/gleegs/arcend-launcher-v2/issues/37)) ([7b6d238](https://github.com/gleegs/arcend-launcher-v2/commit/7b6d2389b0329ab7c9bceaa8e73d9c63e4bce6ff))
- **app:** rename arcend setup ([bfbd172](https://github.com/gleegs/arcend-launcher-v2/commit/bfbd1726acf563ef93f172da8ff2c8952bf0efd3))
- **app:** rename arcend setup ([#38](https://github.com/gleegs/arcend-launcher-v2/issues/38)) ([d025bf4](https://github.com/gleegs/arcend-launcher-v2/commit/d025bf445093fd84a3a84e4d37300c10d8cb8b4e))
- **updater:** add background auto-update via update-electron-app ([ae0381f](https://github.com/gleegs/arcend-launcher-v2/commit/ae0381fcdc5b1a03514fb053dee34be9c3dbd8e9))
- **updater:** add background auto-update via update-electron-app ([#42](https://github.com/gleegs/arcend-launcher-v2/issues/42)) ([97a7155](https://github.com/gleegs/arcend-launcher-v2/commit/97a7155aa6202f832ef7ef1c50bba7aa9116ee67))

## [2.0.0-beta.1](https://github.com/gleegs/arcend-launcher-v2/compare/v2.0.0-beta.0...v2.0.0-beta.1) (2026-06-17)

### Features

- **arc:** add per-arc settings panel ([94414cf](https://github.com/gleegs/arcend-launcher-v2/commit/94414cf6f172453d16289902b589cdc2b4da6326))
- **arc:** add per-arc settings panel ([#35](https://github.com/gleegs/arcend-launcher-v2/issues/35)) ([663e8c9](https://github.com/gleegs/arcend-launcher-v2/commit/663e8c9ed71e29acfa5181dd9d3b8fe732a27cd8))
- **arc:** add uninstall button in arc settings ([81c4fc9](https://github.com/gleegs/arcend-launcher-v2/commit/81c4fc9bd2eaaedd53d4389fb91e88991a99158a))
- **arc:** add uninstall button in arc settings ([#36](https://github.com/gleegs/arcend-launcher-v2/issues/36)) ([5a73c5f](https://github.com/gleegs/arcend-launcher-v2/commit/5a73c5fed02934fceb2b823a9c0bb9cb4dd8b722))
- **sidebar:** display live player count in sidebar via SLP protocol ([0dfc920](https://github.com/gleegs/arcend-launcher-v2/commit/0dfc9202d1231b65de50a2ae116e7b75bff04f92))
- **sidebar:** display live player count in sidebar via SLP protocol ([#34](https://github.com/gleegs/arcend-launcher-v2/issues/34)) ([4783089](https://github.com/gleegs/arcend-launcher-v2/commit/4783089febf90522676397f9f75ea8edf808c1c4))

### Bug Fixes

- **sidebar:** display dynamic launcher version ([7701f56](https://github.com/gleegs/arcend-launcher-v2/commit/7701f5612b95a90fa4e3e1601b72d3df1b806302))
- **sidebar:** display dynamic launcher version ([#33](https://github.com/gleegs/arcend-launcher-v2/issues/33)) ([9b8fd36](https://github.com/gleegs/arcend-launcher-v2/commit/9b8fd36b550e8a269f5054de5ea79f1343c3cdd6))

## 2.0.0-beta.0 (2026-06-14)

La v1 du launcher n'était pas adaptée au système d'arcs changeants d'Arcend. À chaque
nouvel arc, les joueurs perdaient l'accès aux anciens puisqu'ils ne pouvaient pas relancer
un modpack obsolète. La v2 introduit un système **multi-instances** : chaque arc possède
son propre dossier et son modpack, et peut être rejoué en solo même hors-ligne. Les
runtimes Java sont partagés entre instances pour éviter les téléchargements redondants.

### Features

- Authentification Microsoft (connexion/déconnexion)
- Barre latérale avec thumbnails d'arcs et tri intelligent
- Bouton Play/Install contextuel selon l'état de l'arc
- Panneau de paramètres avec toggle console et dossier launcher
- Titlebar personnalisée (minimiser/fermer, drag de fenêtre)
- Affichage de la cover d'arc en grand
- Cache offline des données d'arcs (fonctionne sans connexion)

### Bug Fixes

- Correction de l'URL du packwiz-installer bootstrap
