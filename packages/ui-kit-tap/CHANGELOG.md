# @conciv/ui-kit-tap

## 0.0.22

### Patch Changes

- [#717](https://github.com/conciv-dev/conciv/pull/717) [`63ef72e`](https://github.com/conciv-dev/conciv/commit/63ef72e40f848f3904d431c6c4556d541c950770) Thanks [@omridevk](https://github.com/omridevk)! - Backspace with the caret at the start of the composer removes the last staged attachment.

- [#720](https://github.com/conciv-dev/conciv/pull/720) [`ce77ec7`](https://github.com/conciv-dev/conciv/commit/ce77ec7c930c38c256c3d34261a4d0d83be4e585) Thanks [@omridevk](https://github.com/omridevk)! - The chat composer renders at once instead of waiting for the saved draft; a draft that arrives later fills an untouched composer and merges its attachments into one the user already typed in. The session list no longer refetches on every window focus or whenever another view of it mounts.
- Updated dependencies [[`8316848`](https://github.com/conciv-dev/conciv/commit/831684812362cd61d0c32ad5a1dd7523740e3a4e), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`f0daa1a`](https://github.com/conciv-dev/conciv/commit/f0daa1a089aa580314962870470eda2a01c396e4), [`123466d`](https://github.com/conciv-dev/conciv/commit/123466d3313ba51a75b8828950c2c96045238abf), [`da45a1a`](https://github.com/conciv-dev/conciv/commit/da45a1a1f2e660be14090c8c8234cfc3a0479a3e), [`b96e75c`](https://github.com/conciv-dev/conciv/commit/b96e75cb63d8fab22327016f70976629ef549763), [`6d53b93`](https://github.com/conciv-dev/conciv/commit/6d53b9329faa79d6a9f7f9fec93d0241f07e9c50), [`57aa7f3`](https://github.com/conciv-dev/conciv/commit/57aa7f37cbb18fe3be0a2b6dc341fd612bdbd62c), [`059da2b`](https://github.com/conciv-dev/conciv/commit/059da2b4f46cccc818223903bbab21f3bd9c99b3), [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`8a67d39`](https://github.com/conciv-dev/conciv/commit/8a67d39d925d61aaf881a878bdd3c4dfea0193c4), [`b2dfd2b`](https://github.com/conciv-dev/conciv/commit/b2dfd2b279d7ad6bab81c3c99d3c24874de5c257), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127)]:
  - @conciv/ui-kit-system@0.0.22

## 0.0.21

### Patch Changes

- Updated dependencies [[`ad66158`](https://github.com/conciv-dev/conciv/commit/ad66158ab8919dd5a482f30cca45367df5a9566b), [`71a7483`](https://github.com/conciv-dev/conciv/commit/71a74838dd923c10f8559054495a770f9f8cc0c8), [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee), [`19bd8e7`](https://github.com/conciv-dev/conciv/commit/19bd8e7423d375af888579a5bffff335a3e4c7a3), [`f31c74a`](https://github.com/conciv-dev/conciv/commit/f31c74ad91e9ed4ee2def6b062a6f616dbef6ec1)]:
  - @conciv/ui-kit-system@0.0.21

## 0.0.20

### Patch Changes

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - An external write to a rich text field no longer throws the caret to the end. The controlled value now
  arrives as a ProseMirror transaction that replaces only the differing span, so the editor's own position
  mapping carries the selection through it; a restore into an empty field still lands the caret at the end,
  a write that spans a trigger chip still flattens it to plain text, and the write still resets the undo
  history, so one undo after a restore cannot empty the field.
- Updated dependencies [[`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`9549d4a`](https://github.com/conciv-dev/conciv/commit/9549d4a6b484da8e40135eb8abd676ade23ba1b2), [`e1a0c8b`](https://github.com/conciv-dev/conciv/commit/e1a0c8b982297279cc8ac4cab0c2d8d26a139dd1), [`6699828`](https://github.com/conciv-dev/conciv/commit/669982843b265d397771ca9bfd607aa5976a8ff3), [`478c83b`](https://github.com/conciv-dev/conciv/commit/478c83bdee4d5d7c5e7a27c3586d030907ccf80c), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6)]:
  - @conciv/ui-kit-system@0.0.20

## 0.0.19

### Patch Changes

- Updated dependencies [[`6ce79cf`](https://github.com/conciv-dev/conciv/commit/6ce79cf66cb0629ba965af4d4d06b242c673b017)]:
  - @conciv/ui-kit-system@0.0.19

## 0.0.18

### Patch Changes

- Updated dependencies []:
  - @conciv/ui-kit-system@0.0.18

## 0.0.17

### Patch Changes

- Updated dependencies []:
  - @conciv/ui-kit-system@0.0.17

## 0.0.16

### Patch Changes

- Updated dependencies []:
  - @conciv/ui-kit-system@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @conciv/ui-kit-system@0.0.15

## 0.0.14

### Patch Changes

- Updated dependencies []:
  - @conciv/ui-kit-system@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies []:
  - @conciv/ui-kit-system@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @conciv/ui-kit-system@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies []:
  - @conciv/ui-kit-system@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/ui-kit-system@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies []:
  - @conciv/ui-kit-system@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies []:
  - @conciv/ui-kit-system@0.0.8

## 0.0.7

### Patch Changes

- Updated dependencies []:
  - @conciv/ui-kit-system@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies []:
  - @conciv/ui-kit-system@0.0.6

## 0.0.5

### Patch Changes

- [`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139) Thanks [@omridevk](https://github.com/omridevk)! - new version with fixed deps

- Updated dependencies [[`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139)]:
  - @conciv/ui-kit-system@0.0.5

## 0.0.4

### Patch Changes

- Updated dependencies []:
  - @conciv/ui-kit-system@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @conciv/ui-kit-system@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @conciv/ui-kit-system@0.0.2

## 0.0.1

### Patch Changes

- Updated dependencies []:
  - @conciv/ui-kit-system@0.0.1
