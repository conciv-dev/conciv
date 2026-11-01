# @conciv/ui-kit-tap

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
