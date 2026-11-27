# @conciv/it

## 0.0.23

### Patch Changes

- [#867](https://github.com/conciv-dev/conciv/pull/867) [`c885e8c`](https://github.com/conciv-dev/conciv/commit/c885e8caed5ec9a1bd98bf8360ef2e4c0bab5e8a) Thanks [@omridevk](https://github.com/omridevk)! - The design extension (`@conciv/extension-design`) is not part of this release while it is being rebuilt as a plugin.

- [#828](https://github.com/conciv-dev/conciv/pull/828) [`23d0787`](https://github.com/conciv-dev/conciv/commit/23d078759618f08b80223d26187abb7b2fc5843f) Thanks [@omridevk](https://github.com/omridevk)! - Extensions are opt-in. `@conciv/it` no longer installs any extension: add the ones you want by importing them and
  passing them to the plugin, for example `conciv({extensions: [whiteboard(), design({comparator: 'pixelmatch'})]})`,
  or `withConciv(nextConfig, {extensions: [terminal()]})` on Next.js. Each extension package's default export is now a
  function that takes that extension's options, and the name-keyed `extensions: {design: {...}}` option is gone. The
  server extension object moved to each package's `/server` subpath. `register()` on Next.js now validates `CONCIV_OPTIONS` and fails with a clear error when it is not a valid conciv config.

- [#894](https://github.com/conciv-dev/conciv/pull/894) [`c729476`](https://github.com/conciv-dev/conciv/commit/c7294768a91be15b46ec52d21cfcb8da61d47d55) Thanks [@omridevk](https://github.com/omridevk)! - The webpack and Rspack plugins start the conciv engine only while the bundler watches (`webpack serve`, `rspack dev`, `--watch`). A production build (`webpack --mode production`, `rspack build`) no longer starts an engine or writes a new token to `.conciv/server.json`, and it exits once it has compiled. Closing the watcher stops the engine.

  When the `port` you set in `conciv({port})` is already taken, the webpack or Rspack dev server no longer crashes with `Error: listen EADDRINUSE`. It keeps running without an engine and prints one line: `conciv: port <port> is already in use, the engine did not start. Free the port or pass another port to conciv()`.

  A CommonJS webpack or Rspack config can now load the plugin: `require('@conciv/it/plugin/webpack')` (or `/plugin/rspack`) with `conciv.default()` used to fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`, which broke the configs `conciv init` writes for CommonJS projects.

  `conciv init` on a webpack or Rspack project no longer tells you to serve `@conciv/widget/global` and set `widgetUrl`; neither exists. Its card now says what is true today: the integration starts the engine but does not add the widget to your page, with a link to https://conciv.dev/docs/quick-start/webpack (or `/rspack`).

- Updated dependencies [[`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`81007d1`](https://github.com/conciv-dev/conciv/commit/81007d1f6e3b584203e56f85db1ad38d1a6dc97c), [`5724db1`](https://github.com/conciv-dev/conciv/commit/5724db197a3f71c050123dd34a82416031a1ecbb), [`0935fbc`](https://github.com/conciv-dev/conciv/commit/0935fbc68200be59c2dba8d07ff2fb75ea885be0), [`8f7fcbd`](https://github.com/conciv-dev/conciv/commit/8f7fcbd4b15811e5d5580e49a23be47be0e81b2b), [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6ce2a3b`](https://github.com/conciv-dev/conciv/commit/6ce2a3b90edaebce61a9cafc93dfd6e530b16ddf), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`38352bb`](https://github.com/conciv-dev/conciv/commit/38352bbc7a11064277a16894ac6e0f3358ab3557), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`81007d1`](https://github.com/conciv-dev/conciv/commit/81007d1f6e3b584203e56f85db1ad38d1a6dc97c), [`05800b7`](https://github.com/conciv-dev/conciv/commit/05800b7737dcd9beca2cd6d5ccf67d2f34b9e981), [`98d502f`](https://github.com/conciv-dev/conciv/commit/98d502fcab9c9be38fc5d5215f2e1d78bef772f8), [`81007d1`](https://github.com/conciv-dev/conciv/commit/81007d1f6e3b584203e56f85db1ad38d1a6dc97c), [`3523df4`](https://github.com/conciv-dev/conciv/commit/3523df4b4baba1bb40b04264950c2db5b52ceb99), [`11eb9c6`](https://github.com/conciv-dev/conciv/commit/11eb9c6c9959f11e154eb16b070a305a1775d03d), [`bbdb3ca`](https://github.com/conciv-dev/conciv/commit/bbdb3cad53c14631669b7e29f367df71e95b1344), [`84ea7e3`](https://github.com/conciv-dev/conciv/commit/84ea7e3fe676a4c875535e2f20ca3bc6ffa84c93), [`a80cf98`](https://github.com/conciv-dev/conciv/commit/a80cf986cfd6e4c48b2d78f5e328884046444df5), [`db061b8`](https://github.com/conciv-dev/conciv/commit/db061b8fc2e27041b3b892ae0177133da05056b0), [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c), [`29ee008`](https://github.com/conciv-dev/conciv/commit/29ee0087b9048df5b6f75ae69715b0c9b56b0643), [`3523df4`](https://github.com/conciv-dev/conciv/commit/3523df4b4baba1bb40b04264950c2db5b52ceb99), [`43654a9`](https://github.com/conciv-dev/conciv/commit/43654a90b8abd0e7d4c5743e48c5c8774be9ef22), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`08ec016`](https://github.com/conciv-dev/conciv/commit/08ec0167dc2c63a8f00eb3edc078bd331f2ed0f2), [`ca147d7`](https://github.com/conciv-dev/conciv/commit/ca147d77d4882f267184fe36dc00858200359750), [`549f445`](https://github.com/conciv-dev/conciv/commit/549f445f364067d88cbd1f92f36d4569e2cd0145), [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d), [`eef6c59`](https://github.com/conciv-dev/conciv/commit/eef6c59029f654011fedfdc691021d0cc6502e20), [`fd1ee25`](https://github.com/conciv-dev/conciv/commit/fd1ee25659cb781649c235d6844df3f89d16dd1f), [`4e7e593`](https://github.com/conciv-dev/conciv/commit/4e7e5931c68dbe82f82930e1f358ab252c484d23), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`7a92fc9`](https://github.com/conciv-dev/conciv/commit/7a92fc9b661f9eacf75c14a8cb65d5d303906f24), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`b27ba9d`](https://github.com/conciv-dev/conciv/commit/b27ba9d3e787c376d7a90ed7eb3eb8f7616f9ccd), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`e85758d`](https://github.com/conciv-dev/conciv/commit/e85758dfd5be876c026a749e5840041a4dea03d7), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`161830a`](https://github.com/conciv-dev/conciv/commit/161830a41fcea1269136b174f8d71863ad51aa52), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`1335489`](https://github.com/conciv-dev/conciv/commit/1335489df5c6628934d916c806af21e526f666d7), [`f47e8e7`](https://github.com/conciv-dev/conciv/commit/f47e8e79bc56ef5c826bfe360cc0b492770fa3f8), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f), [`564dd14`](https://github.com/conciv-dev/conciv/commit/564dd148e0dd2f8b7b7b252211f00b5349bab101), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`8913a30`](https://github.com/conciv-dev/conciv/commit/8913a30cd463113c644268180d7ecc4edbdf416b), [`6d82c57`](https://github.com/conciv-dev/conciv/commit/6d82c5741fd8096c2b554286b7045511ac62a3db), [`f567e1f`](https://github.com/conciv-dev/conciv/commit/f567e1f7cb384d4f0f00fbcbfd2b758ae236e79e), [`006b56e`](https://github.com/conciv-dev/conciv/commit/006b56e3d29de298247d47c1c354f6fa090c08a7), [`95a6136`](https://github.com/conciv-dev/conciv/commit/95a61369984b6c93529156d13ec8fdb73c2bc723), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`8a2be86`](https://github.com/conciv-dev/conciv/commit/8a2be866cd08e706a587b56345db6a0b666f787c), [`2bea2e7`](https://github.com/conciv-dev/conciv/commit/2bea2e7a944b2a49db34ca5d6fe56634fbaa609c), [`a3312e3`](https://github.com/conciv-dev/conciv/commit/a3312e303cb721b782442cdb952b10b5c348ec50), [`23d0787`](https://github.com/conciv-dev/conciv/commit/23d078759618f08b80223d26187abb7b2fc5843f), [`65fd8fe`](https://github.com/conciv-dev/conciv/commit/65fd8fe0b0f4d7431a82ccd51da0b6f3d5662eae), [`fe5b3cc`](https://github.com/conciv-dev/conciv/commit/fe5b3ccddb071fbf5021a1f1e2312edcd92c2fec), [`1780a56`](https://github.com/conciv-dev/conciv/commit/1780a5662afcdb273b2ac2d212ba49487f1b1216), [`8ba04d3`](https://github.com/conciv-dev/conciv/commit/8ba04d3c02c5c34680508f2ff6fdbf8227049e4f), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`671870f`](https://github.com/conciv-dev/conciv/commit/671870f6aa0332c4e2fde31cfe5f77c9ccfebefa), [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f), [`6bca3ec`](https://github.com/conciv-dev/conciv/commit/6bca3ecc90ec1e16be822cf759f39e9a7e7d9fce), [`188b7d1`](https://github.com/conciv-dev/conciv/commit/188b7d18c6aa16185ad333dec8e31bda07f1c98d), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`3523df4`](https://github.com/conciv-dev/conciv/commit/3523df4b4baba1bb40b04264950c2db5b52ceb99), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`980f1d3`](https://github.com/conciv-dev/conciv/commit/980f1d3dfaf55491e9c872ea9e7225ee685eb3f2), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`e7eba79`](https://github.com/conciv-dev/conciv/commit/e7eba7997759d03d73543c6d8abc2f181d737234), [`992822d`](https://github.com/conciv-dev/conciv/commit/992822d3649e28992bac4cfac396c85852576ebc), [`fad5a3c`](https://github.com/conciv-dev/conciv/commit/fad5a3cf2f02e10db265c7bf5cebdef0ef97f6af), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`8690874`](https://github.com/conciv-dev/conciv/commit/869087424d55eb15e5b623314569e7ecefbf6b5a), [`0bc80ef`](https://github.com/conciv-dev/conciv/commit/0bc80ef1b0ded255ab9e66a84baf6b5724f2d59f), [`fd70449`](https://github.com/conciv-dev/conciv/commit/fd70449a40e5606bfefaa13d2475b7b8be896de9), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`90f01d8`](https://github.com/conciv-dev/conciv/commit/90f01d88e6e00e60eff4caf5c430414965fdd219), [`6d5d306`](https://github.com/conciv-dev/conciv/commit/6d5d306e1133aecf64d2ddb4351b7468e1f2d26b), [`12efaf7`](https://github.com/conciv-dev/conciv/commit/12efaf7353df1cb30daa997936516fec2ed0b390), [`e1c9542`](https://github.com/conciv-dev/conciv/commit/e1c95429334287f927b28b2122fc7573550ab59d), [`d8be638`](https://github.com/conciv-dev/conciv/commit/d8be638a131ed54979c4a57f2120db9fe33c3e7f), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`e5d82a7`](https://github.com/conciv-dev/conciv/commit/e5d82a71473c2f99dd98428345607ad769c5cba1), [`bac0cc2`](https://github.com/conciv-dev/conciv/commit/bac0cc25711bd1a985813f860a40ff743ab94f51), [`7e9b86b`](https://github.com/conciv-dev/conciv/commit/7e9b86b080f8d4b9c25319d80522ac61ec73ec84), [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580), [`19ad474`](https://github.com/conciv-dev/conciv/commit/19ad474b8cd93a548e881ee2cebcf018bdc25d4f), [`4921829`](https://github.com/conciv-dev/conciv/commit/4921829346d609e82f306f3bbd2436d4d5831045), [`a054799`](https://github.com/conciv-dev/conciv/commit/a0547999c87beb48de9799cf3728cc0bff5160a5), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`571d456`](https://github.com/conciv-dev/conciv/commit/571d456cd232387f11dd2e119d1971f409a825c6), [`5d40e92`](https://github.com/conciv-dev/conciv/commit/5d40e92fce6492d31043de522131043c6e45155b), [`4a6de53`](https://github.com/conciv-dev/conciv/commit/4a6de539af0f65bde769fe45963db28570327e99), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`6308150`](https://github.com/conciv-dev/conciv/commit/6308150f3f7988fbfce42836257fb3e14eef066c), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`d8e27f2`](https://github.com/conciv-dev/conciv/commit/d8e27f2dde4d6bc4c7060862d0a799a0942a48b5), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`c6bdfb5`](https://github.com/conciv-dev/conciv/commit/c6bdfb5ca6fbabce26f5b5667b63a05f4356f82b), [`571d456`](https://github.com/conciv-dev/conciv/commit/571d456cd232387f11dd2e119d1971f409a825c6), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`d0009c9`](https://github.com/conciv-dev/conciv/commit/d0009c9748360343de7a47802a75b4bd0264b13e), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`7e4d195`](https://github.com/conciv-dev/conciv/commit/7e4d195d46ab43964a08db8143705a54e1e76c31), [`71ade66`](https://github.com/conciv-dev/conciv/commit/71ade6614b92808ec78a8b7589e6814caf63b1af), [`3904487`](https://github.com/conciv-dev/conciv/commit/390448709c8d3ed47aa2a82772c76e7ede6e70c5), [`dc69f23`](https://github.com/conciv-dev/conciv/commit/dc69f2341dfdf218db07e9e81a3c9b1cb4469bfa), [`3cc7260`](https://github.com/conciv-dev/conciv/commit/3cc726023903cef93a92f606aef30158f34427c0), [`50e1c33`](https://github.com/conciv-dev/conciv/commit/50e1c33b2124e758ff3996ff568937f3388d3abd), [`347b8b2`](https://github.com/conciv-dev/conciv/commit/347b8b274b6826c5014458d22679ce2587e669a8), [`3b1199f`](https://github.com/conciv-dev/conciv/commit/3b1199fcdda30b7c958bf4cab3db7506d6b145bd), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`9dad84c`](https://github.com/conciv-dev/conciv/commit/9dad84ca01ea9fe7dd5c4b549ad8eab45a6bd462), [`0e4a608`](https://github.com/conciv-dev/conciv/commit/0e4a608768c7eecb5ae4058f03dbdc12ebb41b46), [`35e9999`](https://github.com/conciv-dev/conciv/commit/35e9999ccf358fae142e6d521e0f795ad10862b4), [`549f445`](https://github.com/conciv-dev/conciv/commit/549f445f364067d88cbd1f92f36d4569e2cd0145), [`8e59425`](https://github.com/conciv-dev/conciv/commit/8e59425695725c2d28ca460bb755d7da5edcd7dd), [`6bca3ec`](https://github.com/conciv-dev/conciv/commit/6bca3ecc90ec1e16be822cf759f39e9a7e7d9fce), [`4d05601`](https://github.com/conciv-dev/conciv/commit/4d05601bb1b5a30bcb5d96574da8e0aa3af449e9), [`94bd182`](https://github.com/conciv-dev/conciv/commit/94bd182a63c447973b30e832fe5a844bfe8683b8), [`7ef3472`](https://github.com/conciv-dev/conciv/commit/7ef3472787f26155c38128c2a1b8ffcec8ff5bf3), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`a354155`](https://github.com/conciv-dev/conciv/commit/a3541552b1b74ebace02d2bcbf1968ac2d92f9f2), [`51708bc`](https://github.com/conciv-dev/conciv/commit/51708bc06ee28f6ff7529ee6a381aa2225e3675c), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`e82bd73`](https://github.com/conciv-dev/conciv/commit/e82bd73dba923e61ba9df8a6fa8947a582979d92), [`05cb735`](https://github.com/conciv-dev/conciv/commit/05cb735d37ef115c10497ae249d1207b8272db22), [`83c6c31`](https://github.com/conciv-dev/conciv/commit/83c6c31813526758e86b21984b7d224738920fe7), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`1f2e0d0`](https://github.com/conciv-dev/conciv/commit/1f2e0d0c59f2d84b26d800bfe6b12e56c3a32db6), [`e76257e`](https://github.com/conciv-dev/conciv/commit/e76257ee22420792b3614a76abb5645dd765e77d), [`042f5f1`](https://github.com/conciv-dev/conciv/commit/042f5f1dc38120382a7f2f9e780733439b1cfd5b), [`0a7b4d1`](https://github.com/conciv-dev/conciv/commit/0a7b4d1d164d7f0fdfcfd45cbd99f0a0810a5293), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`c0686d5`](https://github.com/conciv-dev/conciv/commit/c0686d5a73cd6982f749209d7acd743df9e30ca3), [`60c35bb`](https://github.com/conciv-dev/conciv/commit/60c35bbfb737b5de57937966e63b18bf297bcf4a), [`35c398f`](https://github.com/conciv-dev/conciv/commit/35c398f3edad91dbfd78508e00c2d5f531e8d719), [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`5ef5993`](https://github.com/conciv-dev/conciv/commit/5ef59937b99af4b64b75028f545c9287752d5626), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6336e2d`](https://github.com/conciv-dev/conciv/commit/6336e2d0d41c3dac619e51786e58601126cad4f8), [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c), [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c), [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c), [`8ea7534`](https://github.com/conciv-dev/conciv/commit/8ea7534e466291f61acaadc7b04a60248da486ce), [`58c033f`](https://github.com/conciv-dev/conciv/commit/58c033fbf39bdba7b1575d68219e6afee2e59db6), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`67e6799`](https://github.com/conciv-dev/conciv/commit/67e6799b2b4c1dd660d4abc84cc9f1edec5fd24a), [`4aa9434`](https://github.com/conciv-dev/conciv/commit/4aa94340ef03e6ba03868d9b68e394a8d23f7f7f), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`11cb89a`](https://github.com/conciv-dev/conciv/commit/11cb89a15c98397854708999c77b9292e426bfac), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`5cfd01a`](https://github.com/conciv-dev/conciv/commit/5cfd01a8b6ace969fd93d08a76f1c4324fc64da9), [`7a0d8ab`](https://github.com/conciv-dev/conciv/commit/7a0d8abc8a8b619c90db51376b289b450381d8f6), [`dde5705`](https://github.com/conciv-dev/conciv/commit/dde5705b3b869629ad135f58b438d5c9f5c0a070), [`8d6cf7a`](https://github.com/conciv-dev/conciv/commit/8d6cf7a22a08c8651dc87175e94430d652b8a468), [`74c08ec`](https://github.com/conciv-dev/conciv/commit/74c08ec2e63a69e6c90fbb063e273e6638c02c39), [`a8c4a20`](https://github.com/conciv-dev/conciv/commit/a8c4a20b789d17ee618c049b99d03edcd1388313), [`cd708e4`](https://github.com/conciv-dev/conciv/commit/cd708e453045126e0aea89bbfa24de045643292b), [`38352bb`](https://github.com/conciv-dev/conciv/commit/38352bbc7a11064277a16894ac6e0f3358ab3557), [`d41452c`](https://github.com/conciv-dev/conciv/commit/d41452c2c173347cc7b4da2f50be27e8fb0a255b), [`6bca3ec`](https://github.com/conciv-dev/conciv/commit/6bca3ecc90ec1e16be822cf759f39e9a7e7d9fce), [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`66d8783`](https://github.com/conciv-dev/conciv/commit/66d8783229541cd71e1991732b60bdbee4040143), [`08bc51a`](https://github.com/conciv-dev/conciv/commit/08bc51a65258ceb129c9322dfa736fd71be4ec61), [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`5c6a702`](https://github.com/conciv-dev/conciv/commit/5c6a70239423b44a2795ee33384dac1ce0f33e3c), [`fe5b3cc`](https://github.com/conciv-dev/conciv/commit/fe5b3ccddb071fbf5021a1f1e2312edcd92c2fec), [`db35bee`](https://github.com/conciv-dev/conciv/commit/db35beeb569e5ca2a90ab7cb9fc1d6691068443a), [`3523df4`](https://github.com/conciv-dev/conciv/commit/3523df4b4baba1bb40b04264950c2db5b52ceb99), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`2574b0a`](https://github.com/conciv-dev/conciv/commit/2574b0acb78711cf24be7f3fe2e1061dd0d5cb29), [`42350f9`](https://github.com/conciv-dev/conciv/commit/42350f9b2c9a7de7e43ab562a2c5b67afa73186f), [`1c3a9b4`](https://github.com/conciv-dev/conciv/commit/1c3a9b4023e0ce22dd0845902e65c883db763f94), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`147931d`](https://github.com/conciv-dev/conciv/commit/147931d44d6cad974adc48cc8e3dab23f825ec05), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`d56a580`](https://github.com/conciv-dev/conciv/commit/d56a580d801eabe358d469017a110a81acf5165c), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`4472ce6`](https://github.com/conciv-dev/conciv/commit/4472ce6b9a2667159e34f55fc650428c2fc68b25), [`df01840`](https://github.com/conciv-dev/conciv/commit/df018404a9921e3de6a25759551c8df4a879e27c), [`21ca439`](https://github.com/conciv-dev/conciv/commit/21ca439ec798f2a2598a767c3b878129bc83f5e6), [`c729476`](https://github.com/conciv-dev/conciv/commit/c7294768a91be15b46ec52d21cfcb8da61d47d55), [`8f71f4e`](https://github.com/conciv-dev/conciv/commit/8f71f4eb46ba64bd0a48560ecd33051a6263aaf5), [`f18dd1a`](https://github.com/conciv-dev/conciv/commit/f18dd1a52bc375526966cc3a87b1abdf15167d95), [`8f7fcbd`](https://github.com/conciv-dev/conciv/commit/8f7fcbd4b15811e5d5580e49a23be47be0e81b2b), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811)]:
  - @conciv/app@0.0.23
  - @conciv/unplugin@0.0.23

## 0.0.22

### Patch Changes

- Updated dependencies [[`5af74ae`](https://github.com/conciv-dev/conciv/commit/5af74ae55b8e53b0b0e51c598d8d05a3b477b679), [`8316848`](https://github.com/conciv-dev/conciv/commit/831684812362cd61d0c32ad5a1dd7523740e3a4e), [`8316848`](https://github.com/conciv-dev/conciv/commit/831684812362cd61d0c32ad5a1dd7523740e3a4e), [`d255573`](https://github.com/conciv-dev/conciv/commit/d255573f14ff345fc58e68a9e1ffdcae48765b68), [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b), [`6a9fd5b`](https://github.com/conciv-dev/conciv/commit/6a9fd5b1aeff3a7c628be188c570175dabcd71f9), [`4e903c0`](https://github.com/conciv-dev/conciv/commit/4e903c099601d586c7ecb904f5172f71dd5a3d3c), [`5a5e82d`](https://github.com/conciv-dev/conciv/commit/5a5e82d134b88e40153ceeb94abd1516ac28d674), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`2a25287`](https://github.com/conciv-dev/conciv/commit/2a2528793ff95ca0959cd3183caf8b0bdfbcc90a), [`69e9307`](https://github.com/conciv-dev/conciv/commit/69e9307a76b191720e8abd5d163a3f3cfc8d69b8), [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd), [`da45a1a`](https://github.com/conciv-dev/conciv/commit/da45a1a1f2e660be14090c8c8234cfc3a0479a3e), [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f), [`329d617`](https://github.com/conciv-dev/conciv/commit/329d617adae69e905ce994cfb4d88893d3d62a8e), [`ce9a173`](https://github.com/conciv-dev/conciv/commit/ce9a173a4850ad3fd2ea7fdc8f9249844d6689f0), [`329d617`](https://github.com/conciv-dev/conciv/commit/329d617adae69e905ce994cfb4d88893d3d62a8e), [`4e903c0`](https://github.com/conciv-dev/conciv/commit/4e903c099601d586c7ecb904f5172f71dd5a3d3c), [`8c2b6a6`](https://github.com/conciv-dev/conciv/commit/8c2b6a63679307b293e39a0ccba902a4563cc20f), [`b591c13`](https://github.com/conciv-dev/conciv/commit/b591c138b32b293a14f1d3f2dc92d5c58889402c), [`4c7cded`](https://github.com/conciv-dev/conciv/commit/4c7cdedfb8841a03edb84eecf2047e76f1269640), [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f), [`833e152`](https://github.com/conciv-dev/conciv/commit/833e152b832e955a5d1b81be13ef74e806b3030f), [`fbb0bf7`](https://github.com/conciv-dev/conciv/commit/fbb0bf715caf774bec5f1cf400f9c34ab0fc6823), [`8316848`](https://github.com/conciv-dev/conciv/commit/831684812362cd61d0c32ad5a1dd7523740e3a4e), [`6d53b93`](https://github.com/conciv-dev/conciv/commit/6d53b9329faa79d6a9f7f9fec93d0241f07e9c50), [`032f25f`](https://github.com/conciv-dev/conciv/commit/032f25f9a632c4d560e680cec226fd39a490855f), [`4e903c0`](https://github.com/conciv-dev/conciv/commit/4e903c099601d586c7ecb904f5172f71dd5a3d3c), [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8), [`bd41ba7`](https://github.com/conciv-dev/conciv/commit/bd41ba79644530696274de010e230b6adcdf30b1), [`e8cc8ff`](https://github.com/conciv-dev/conciv/commit/e8cc8ff39b4ebcddf77aa7acf027b8abdc1a1194), [`ef77625`](https://github.com/conciv-dev/conciv/commit/ef7762536509fb2eb2000908ae91ca98f50a9ab6), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`90b6995`](https://github.com/conciv-dev/conciv/commit/90b6995ccf644e15b1e111926a1648a4b780713a), [`b2dfd2b`](https://github.com/conciv-dev/conciv/commit/b2dfd2b279d7ad6bab81c3c99d3c24874de5c257), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`90b6995`](https://github.com/conciv-dev/conciv/commit/90b6995ccf644e15b1e111926a1648a4b780713a), [`26576dc`](https://github.com/conciv-dev/conciv/commit/26576dc0dd99d34892ba238a6d0c550c40ab312f), [`b47adb4`](https://github.com/conciv-dev/conciv/commit/b47adb4f9f84e2e8882d53c33c30049a5040b700)]:
  - @conciv/embed@0.0.22
  - @conciv/extension-compiler@0.0.22
  - @conciv/extension-design@0.0.22
  - @conciv/plugin@0.0.22
  - @conciv/extension-whiteboard@0.0.22
  - @conciv/extension-test-runner@0.0.22
  - @conciv/extension-recorder@0.0.22
  - @conciv/extension-terminal@0.0.22
  - @conciv/extension-ios@0.0.22

## 0.0.21

### Patch Changes

- [#650](https://github.com/conciv-dev/conciv/pull/650) [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee) Thanks [@omridevk](https://github.com/omridevk)! - New built-in design extension, mounted by `@conciv/it`: register a design image as the target of a route at a width, then `conciv tools design diff` compares the live page with it and ranks the components that differ, with the deltas and the source that sets them. `conciv tools design status` says when every registered width matches. The agent guide written by `conciv init` describes the loop.
- Updated dependencies [[`0fdd3ef`](https://github.com/conciv-dev/conciv/commit/0fdd3ef2374de79178daa70d5987bc43673684ce), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee), [`0d9fe32`](https://github.com/conciv-dev/conciv/commit/0d9fe3275ada18af5e0e65c37c79b8f3662c8d3a), [`f727664`](https://github.com/conciv-dev/conciv/commit/f727664be45006d5bf2acf7234bbbbaa3f647ac7), [`af69127`](https://github.com/conciv-dev/conciv/commit/af69127fb97de0d722e206a6d31471a0569fdf02), [`8d69e53`](https://github.com/conciv-dev/conciv/commit/8d69e53ab3e7c4856db980bb5656eda4fddac9ed), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`c202114`](https://github.com/conciv-dev/conciv/commit/c20211415e977a79d08af5f083b9bc28cbb56900), [`15c2fcb`](https://github.com/conciv-dev/conciv/commit/15c2fcb875fae4ffa552671380b7227a1e790d6f), [`71a7483`](https://github.com/conciv-dev/conciv/commit/71a74838dd923c10f8559054495a770f9f8cc0c8), [`4465b85`](https://github.com/conciv-dev/conciv/commit/4465b854e45ce6553eebd6547e2d0be49157f71e), [`19bd8e7`](https://github.com/conciv-dev/conciv/commit/19bd8e7423d375af888579a5bffff335a3e4c7a3), [`c90309e`](https://github.com/conciv-dev/conciv/commit/c90309e4bf79f3576555ec3feb2e6af8a4f563dd), [`62f5429`](https://github.com/conciv-dev/conciv/commit/62f5429329a717535efe3a9ec6c61f00cb2f1a61)]:
  - @conciv/plugin@0.0.21
  - @conciv/extension-compiler@0.0.21
  - @conciv/extension-whiteboard@0.0.21
  - @conciv/embed@0.0.21
  - @conciv/extension-design@0.0.21
  - @conciv/extension-recorder@0.0.21
  - @conciv/extension-ios@0.0.21
  - @conciv/extension-terminal@0.0.21
  - @conciv/extension-test-runner@0.0.21

## 0.0.20

### Patch Changes

- [#613](https://github.com/conciv-dev/conciv/pull/613) [`9e9e683`](https://github.com/conciv-dev/conciv/commit/9e9e683fb48ab3fdd9ae41de86dafff4fb3fa28d) Thanks [@omridevk](https://github.com/omridevk)! - The Next.js entry (`@conciv/it/plugin/nextjs`, `@conciv/plugin/nextjs`) now resolves to a Node-free `register` under the `edge-light` export condition, so the Edge build of `instrumentation.ts` no longer pulls in `node:fs`/`process.cwd` and Next stops printing "not supported in the Edge Runtime" warnings. No import path changes.

- [#517](https://github.com/conciv-dev/conciv/pull/517) [`a3bf205`](https://github.com/conciv-dev/conciv/commit/a3bf205875635f8fdda4d8a9fc5cf5856b019356) Thanks [@omridevk](https://github.com/omridevk)! - Align the `@conciv/it` package description with the "Claude Code, living inside your running app" headline used on the README and site.
- Updated dependencies [[`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`258fe9a`](https://github.com/conciv-dev/conciv/commit/258fe9a39f93eaf2f258f0f87efa9b2e3878fa01), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`9e9e683`](https://github.com/conciv-dev/conciv/commit/9e9e683fb48ab3fdd9ae41de86dafff4fb3fa28d), [`d796d1e`](https://github.com/conciv-dev/conciv/commit/d796d1e8a08f86ed9593cadff9748b5d57772cf2), [`efef98a`](https://github.com/conciv-dev/conciv/commit/efef98ab991cd2ce4aca49d7696a135ec0894bec), [`6020d52`](https://github.com/conciv-dev/conciv/commit/6020d52d60bc6c824118d10787d557beeac1fc3f), [`f3bea6c`](https://github.com/conciv-dev/conciv/commit/f3bea6c3656a282dc193b86f9835bfa80ba135d7), [`e1a0c8b`](https://github.com/conciv-dev/conciv/commit/e1a0c8b982297279cc8ac4cab0c2d8d26a139dd1), [`84905d3`](https://github.com/conciv-dev/conciv/commit/84905d36e10b9cbc0dd54736e3f8c6e84b38e3b6), [`1ff8988`](https://github.com/conciv-dev/conciv/commit/1ff89883697627cf4d9c108a602607a0af921bc6), [`c5015fe`](https://github.com/conciv-dev/conciv/commit/c5015fe3ec89327975fabf814f0d6eaadcada1fb), [`d03af7f`](https://github.com/conciv-dev/conciv/commit/d03af7f7cac4267f9b573f0cadcd69e74c019f89), [`2991888`](https://github.com/conciv-dev/conciv/commit/2991888b1c4baf1d290d39330faf23084959632e), [`413bc87`](https://github.com/conciv-dev/conciv/commit/413bc87ccfd2cc445f0a5b05e039a92d952c29b9), [`04a35ca`](https://github.com/conciv-dev/conciv/commit/04a35cafed78ae6f03b509d4d8d74d545c574923), [`163cfd5`](https://github.com/conciv-dev/conciv/commit/163cfd5f844a2c8b97a97c8ceb1440076ff69a21), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`6699828`](https://github.com/conciv-dev/conciv/commit/669982843b265d397771ca9bfd607aa5976a8ff3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`78f17c8`](https://github.com/conciv-dev/conciv/commit/78f17c876b6d101170b92afec396f0fcec0ee3f3), [`0537a17`](https://github.com/conciv-dev/conciv/commit/0537a17c89c2f052220b71baa95e2552f5a17eff), [`70614e8`](https://github.com/conciv-dev/conciv/commit/70614e8f2b415145bfb8f9198bd8818307d15478), [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a), [`7a95ab8`](https://github.com/conciv-dev/conciv/commit/7a95ab8e0cf959d75fb0b47977325b02d90c4718), [`cef1f05`](https://github.com/conciv-dev/conciv/commit/cef1f0553911fcf02e3db8660b48d540062966ad), [`152a7bd`](https://github.com/conciv-dev/conciv/commit/152a7bdf788399e72e20ddb3c780217940faa632)]:
  - @conciv/extension-recorder@0.0.20
  - @conciv/extension-terminal@0.0.20
  - @conciv/extension-test-runner@0.0.20
  - @conciv/extension-whiteboard@0.0.20
  - @conciv/embed@0.0.20
  - @conciv/plugin@0.0.20
  - @conciv/extension-compiler@0.0.20
  - @conciv/extension-ios@0.0.20

## 0.0.19

### Patch Changes

- Updated dependencies [[`c6aa92c`](https://github.com/conciv-dev/conciv/commit/c6aa92c53847d9f811eafebf414492335864955b), [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323)]:
  - @conciv/plugin@0.0.19
  - @conciv/embed@0.0.19
  - @conciv/extension-recorder@0.0.19
  - @conciv/extension-terminal@0.0.19
  - @conciv/extension-test-runner@0.0.19
  - @conciv/extension-whiteboard@0.0.19
  - @conciv/extension-ios@0.0.19
  - @conciv/extension-compiler@0.0.19

## 0.0.18

### Patch Changes

- Updated dependencies [[`830fc5d`](https://github.com/conciv-dev/conciv/commit/830fc5d17b3bf6ce146b413bb7ddb372ad2c821a), [`47c5423`](https://github.com/conciv-dev/conciv/commit/47c5423107f588c9bf5cc94faa5348fc769ef89e), [`05142ed`](https://github.com/conciv-dev/conciv/commit/05142ed5d738309686e35d9231139229b07bd408)]:
  - @conciv/extension-ios@0.0.18
  - @conciv/embed@0.0.18
  - @conciv/extension-compiler@0.0.18
  - @conciv/extension-recorder@0.0.18
  - @conciv/extension-terminal@0.0.18
  - @conciv/extension-test-runner@0.0.18
  - @conciv/plugin@0.0.18
  - @conciv/extension-whiteboard@0.0.18

## 0.0.17

### Patch Changes

- [#151](https://github.com/conciv-dev/conciv/pull/151) [`5396837`](https://github.com/conciv-dev/conciv/commit/53968379fbc6958eb2642d544f6f64791d811243) Thanks [@omridevk](https://github.com/omridevk)! - Restore pairing-file discovery for hosts that install @conciv/it. A dev core again writes
  `~/.conciv/dev-endpoint.json`, so the iOS SDK finds the running dev server instead of falling back to
  probing a fixed list of ports. The temporary-directory location that 0.0.16 forced on every run is
  now a plugin option, `devEndpointDir`, that a host sets when it wants the pairing file elsewhere.
- Updated dependencies [[`0d2ddf6`](https://github.com/conciv-dev/conciv/commit/0d2ddf6cb63baa58095a70faf9783c12a895928c), [`d76c337`](https://github.com/conciv-dev/conciv/commit/d76c337ba404b1f5c23a6f548a92e008f09490dd)]:
  - @conciv/embed@0.0.17
  - @conciv/extension-ios@0.0.17
  - @conciv/extension-terminal@0.0.17
  - @conciv/extension-test-runner@0.0.17
  - @conciv/extension-whiteboard@0.0.17
  - @conciv/plugin@0.0.17
  - @conciv/extension-compiler@0.0.17

## 0.0.16

### Patch Changes

- [#126](https://github.com/conciv-dev/conciv/pull/126) [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b) Thanks [@omridevk](https://github.com/omridevk)! - First-party extensions are folder-installable: `pnpm add @conciv/extension-<name>`, drop a one-line re-export in `conciv/extensions/<name>.tsx`, and both halves load on every supported framework.

  Every published extension (tanstack, terminal, test-runner, whiteboard, recorder) ships per-environment conditional exports: the `browser` condition resolves `dist/client.js`, the `import` condition resolves `dist/server.js`, with per-condition `types`, plus an explicit `./server` subpath. `@conciv/extension-compiler` gains the shared discovery primitives (`@conciv/extension-compiler/dedupe`: provenance-carrying `dedupeExtensions`, `toSortedEntries`, `isExtension`) used by both the server loader and every client path; `loadServerExtensions` now matches files exactly (no directories, no `.d.ts`), treats a missing default export as fatal, and reports every dropped entry with its source and reason. `listExtensionFiles` is the single fs listing primitive.

  Next.js support (Turbopack and `next dev --webpack`, current GA line): `withConciv` generates an app-local `.conciv/extensions-client.gen.tsx` entry (knitwork static imports, idempotent) and wires it to the widget via `turbopack.resolveAlias`/webpack alias as `@conciv/app-extensions`; `register()` runs a chokidar watcher that regenerates the entry live on add/remove. The widget stays lazy (dynamic imports behind the dev-only guard), the engine register entrypoints are stubbed out of Next edge-runtime compilations, and the generated client module now threads a resolved dedupe entry so dist-mode consumers boot. The tanstack extension renders a mount-time composer chip as its client-active surface and degrades gracefully in apps without a TanStack router.

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`af04b36`](https://github.com/conciv-dev/conciv/commit/af04b368a4b7bf2eecf3fb20f0b6c0949368ce1e), [`af04b36`](https://github.com/conciv-dev/conciv/commit/af04b368a4b7bf2eecf3fb20f0b6c0949368ce1e), [`af04b36`](https://github.com/conciv-dev/conciv/commit/af04b368a4b7bf2eecf3fb20f0b6c0949368ce1e), [`af04b36`](https://github.com/conciv-dev/conciv/commit/af04b368a4b7bf2eecf3fb20f0b6c0949368ce1e), [`1019e21`](https://github.com/conciv-dev/conciv/commit/1019e213fc99b84d0931a50cffa2cd602fd31e0e), [`aa06a88`](https://github.com/conciv-dev/conciv/commit/aa06a88067430bd97934f4abb0b096bfdf1812f4), [`7627eba`](https://github.com/conciv-dev/conciv/commit/7627eba4ffaddd6e85289724759f41d75b5c2e7b)]:
  - @conciv/extension-terminal@0.0.16
  - @conciv/extension-test-runner@0.0.16
  - @conciv/extension-whiteboard@0.0.16
  - @conciv/extension-compiler@0.0.16
  - @conciv/plugin@0.0.16
  - @conciv/extension-ios@0.0.16
  - @conciv/embed@0.0.16

## 0.0.15

### Patch Changes

- [`5eaa498`](https://github.com/conciv-dev/conciv/commit/5eaa4984cc5e8f4c673bb6d2c9e70b2b40c1c1b2) Thanks [@omridevk](https://github.com/omridevk)! - Fix widget flicker on open, restore FAB hover, and drop the recorder from the builtin extensions.

  The panel subtree was destroyed on close, so every open remounted the chat pane, opened a fresh session and SSE subscription, and rendered blank for ~100ms before replaying every message row's entrance at once. The panel now mounts on first open and stays mounted; closing only toggles its visibility classes.

  Entrance shortcuts (`anim-fab`, `anim-pop`, `anim-presence-in`) carried `animation-fill-mode: both`. Since the keyframes end at the element's natural state, the forwards fill only served to pin `transform` after the animation finished, which outranked the FAB's hover lift and press states. `anim-rise`/`anim-rise-d` keep a fill as `backwards`, which is what their `animation-delay` actually needs.

  `@conciv/extension-recorder` is no longer registered as a builtin: it started rrweb capture on every page load whether or not a recording was wanted, and the resulting flush traffic degraded widget responsiveness ([#114](https://github.com/conciv-dev/conciv/issues/114)). The package is still published and can be enabled explicitly.

- Updated dependencies [[`7b075ac`](https://github.com/conciv-dev/conciv/commit/7b075aca0d634fbfa9893f34a1366c2a1af9e20d)]:
  - @conciv/extension-terminal@0.0.15
  - @conciv/embed@0.0.15
  - @conciv/extension-test-runner@0.0.15
  - @conciv/extension-whiteboard@0.0.15
  - @conciv/plugin@0.0.15

## 0.0.14

### Patch Changes

- Updated dependencies [[`32deb1c`](https://github.com/conciv-dev/conciv/commit/32deb1c4e25e5a8a8fb8ac1d0b089347433cc483)]:
  - @conciv/extension-recorder@0.0.14
  - @conciv/embed@0.0.14
  - @conciv/extension-terminal@0.0.14
  - @conciv/extension-test-runner@0.0.14
  - @conciv/extension-whiteboard@0.0.14
  - @conciv/plugin@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies [[`5db2ac5`](https://github.com/conciv-dev/conciv/commit/5db2ac5a8e7d49f2966cbbaf6718483f5837f759)]:
  - @conciv/embed@0.0.13
  - @conciv/extension-terminal@0.0.13
  - @conciv/extension-test-runner@0.0.13
  - @conciv/extension-whiteboard@0.0.13
  - @conciv/plugin@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @conciv/extension-test-runner@0.0.12
  - @conciv/plugin@0.0.12
  - @conciv/embed@0.0.12
  - @conciv/extension-terminal@0.0.12
  - @conciv/extension-whiteboard@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies []:
  - @conciv/embed@0.0.11
  - @conciv/plugin@0.0.11
  - @conciv/extension-terminal@0.0.11
  - @conciv/extension-test-runner@0.0.11
  - @conciv/extension-whiteboard@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/embed@0.0.10
  - @conciv/extension-terminal@0.0.10
  - @conciv/extension-test-runner@0.0.10
  - @conciv/extension-whiteboard@0.0.10
  - @conciv/plugin@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies [[`c25f76d`](https://github.com/conciv-dev/conciv/commit/c25f76d9cc208c21b15e4444491aa073b680e195), [`18c9521`](https://github.com/conciv-dev/conciv/commit/18c9521886d3f7ea4054ae0ae638494312dc80b8)]:
  - @conciv/plugin@0.0.9
  - @conciv/extension-terminal@0.0.9
  - @conciv/extension-whiteboard@0.0.9
  - @conciv/embed@0.0.9
  - @conciv/extension-test-runner@0.0.9

## 0.0.8

### Patch Changes

- [#54](https://github.com/conciv-dev/conciv/pull/54) [`945901b`](https://github.com/conciv-dev/conciv/commit/945901ba8780486412520fbbe478488cc2953fb1) Thanks [@omridevk](https://github.com/omridevk)! - Motion pass across the widget and site (subtler entrances, interruptible open/close, reduced-motion gates, transform-based movement, token cohesion), plus site-embedding fixes: resolve `@conciv/embed` to an absolute path so consumer apps do not declare it, skip widget injection into nested frames, and dedupe the Solid singletons (`solid-js`, `@tanstack/solid-router`, `@ark-ui/solid`) so embedders load a single copy.

- Updated dependencies [[`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf), [`68d1f16`](https://github.com/conciv-dev/conciv/commit/68d1f16d1278c38a18ff35f8d4a7fdadf6086c8e)]:
  - @conciv/plugin@0.0.8
  - @conciv/extension-whiteboard@0.0.8
  - @conciv/embed@0.0.8
  - @conciv/extension-test-runner@0.0.8
  - @conciv/extension-terminal@0.0.8

## 0.0.7

### Patch Changes

- Updated dependencies []:
  - @conciv/extension-test-runner@0.0.7
  - @conciv/plugin@0.0.7
  - @conciv/extension-whiteboard@0.0.7
  - @conciv/extension-terminal@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies [[`6a30c91`](https://github.com/conciv-dev/conciv/commit/6a30c91c76a4ff1df456a14eca0f9d4a78744a57)]:
  - @conciv/plugin@0.0.6
  - @conciv/extension-whiteboard@0.0.6
  - @conciv/extension-test-runner@0.0.6

## 0.0.5

### Patch Changes

- [`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139) Thanks [@omridevk](https://github.com/omridevk)! - new version with fixed deps

- Updated dependencies [[`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139), [`d9e01e2`](https://github.com/conciv-dev/conciv/commit/d9e01e2d1b6bc5cc959274a7104cc66cd02c23fe)]:
  - @conciv/extension-test-runner@0.0.5
  - @conciv/extension-whiteboard@0.0.5
  - @conciv/plugin@0.0.5

## 0.0.4

### Patch Changes

- Updated dependencies [[`9480816`](https://github.com/conciv-dev/conciv/commit/948081665656ee4fc149701c3206a17402b47299)]:
  - @conciv/plugin@0.0.4
  - @conciv/extension-whiteboard@0.0.4
  - @conciv/extension-test-runner@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies [[`2d67cc9`](https://github.com/conciv-dev/conciv/commit/2d67cc9785da2274f503c77c839777cc30147e34)]:
  - @conciv/plugin@0.0.3
  - @conciv/extension-whiteboard@0.0.3
  - @conciv/extension-test-runner@0.0.3

## 0.0.2

### Patch Changes

- [`03d554d`](https://github.com/conciv-dev/conciv/commit/03d554d3459c7ca24484fac75bfbc4cad2db0430) Thanks [@omridevk](https://github.com/omridevk)! - Point all package homepages at https://conciv.dev. First release published via GitHub Actions OIDC trusted publishing (with provenance).

- Updated dependencies []:
  - @conciv/extension-test-runner@0.0.2
  - @conciv/extension-whiteboard@0.0.2
  - @conciv/plugin@0.0.2

## 0.0.1

### Patch Changes

- Initial public release of conciv: install `@conciv/it` and add the plugin from `@conciv/it/plugin/<bundler>` (vite, webpack, rspack, rollup, esbuild, nextjs).

- Updated dependencies []:
  - @conciv/extension-test-runner@0.0.1
  - @conciv/extension-whiteboard@0.0.1
  - @conciv/plugin@0.0.1
