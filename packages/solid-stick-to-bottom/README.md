# @conciv/solid-stick-to-bottom

A SolidJS port of [use-stick-to-bottom](https://github.com/stackblitz-labs/use-stick-to-bottom)
(StackBlitz, MIT): a stick-to-bottom scroll behavior for chat and log viewports, spring-following
new content while it stays anchored to the bottom, and getting out of the way the moment someone
scrolls up to read.

Upstream ships only a React hook; this package is a from-scratch SolidJS reimplementation of the
same behavior, kept in `@conciv/*` scope because there is no published Solid port on npm.

Part of [conciv](https://github.com/conciv-dev/conciv). It ships as a dependency of the umbrella
package; install that:

```sh
npm install -D @conciv/it
```

Or install directly:

```sh
npm install @conciv/solid-stick-to-bottom
```

## Usage

```tsx
import {createStickToBottom} from '@conciv/solid-stick-to-bottom'
import {createSignal} from 'solid-js'

function Log() {
  const [viewport, setViewport] = createSignal<HTMLElement>()
  const stick = createStickToBottom(viewport, {initial: 'instant'})

  return (
    <div ref={setViewport} style={{'overflow-y': 'auto'}}>
      {/* ...streamed rows... */}
    </div>
  )
}
```

## API

`createStickToBottom(scrollElement, options?)` returns:

| Return            | Type                                                    | Description                                                      |
| ----------------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| `isAtBottom`      | `Accessor<boolean>`                                     | True once the viewport is stuck (or close enough) to the bottom. |
| `isNearBottom`    | `Accessor<boolean>`                                     | True within the 70px follow band, independent of lock state.     |
| `escapedFromLock` | `Accessor<boolean>`                                     | True after the user scrolled up out of the stuck state.          |
| `scrollToBottom`  | `(options?: ScrollToBottomOptions) => Promise<boolean>` | Re-locks and animates to the bottom; resolves once settled.      |
| `stopScroll`      | `() => void`                                            | Cancels any in-flight scroll and marks the lock as escaped.      |

`StickToBottomOptions`:

| Option    | Type                   | Description                                                                                             |
| --------- | ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `initial` | `Animation \| boolean` | Animation for the first scroll-to-bottom, or `false` to start unstuck.                                  |
| `resize`  | `Animation`            | Animation used when content grows after the initial mount; shrink re-locks instantly without animating. |
| `follow`  | `Accessor<boolean>`    | Gate that must be true for growth to trigger an auto-scroll.                                            |

`ScrollToBottomOptions` (passed to the returned `scrollToBottom`):

| Option                   | Type                | Description                                                       |
| ------------------------ | ------------------- | ----------------------------------------------------------------- |
| `animation`              | `Animation`         | `'instant'` or a partial spring override for this call only.      |
| `wait`                   | `boolean \| number` | Delay (ms) or `true` to wait for the current frame before moving. |
| `ignoreEscapes`          | `boolean`           | Suppress the escape-on-scroll-up guard for this call.             |
| `preserveScrollPosition` | `boolean`           | Don't force `isAtBottom` true before the animation starts.        |
| `duration`               | `number`            | Minimum duration (ms) to hold the animation for.                  |

`Animation` is `'instant'` or a partial `SpringAnimation` (`{damping, stiffness, mass}`), merged
over the default spring.

## Semantics

- **70px follow band.** The viewport counts as "near bottom" whenever it's within 70px of the
  true bottom, which is what re-arms the lock after content growth.
- **Escape on up-scroll.** Any scroll that moves the viewport further from the bottom than the
  last tick immediately escapes the lock; the caller stops auto-scrolling until it re-locks.
- **Shrink re-locks silently and never scrolls.** When content shrinks (viewport height goes
  down) and the result lands within the follow band, the lock re-engages without animating —
  there is nothing to catch up to.
- **Spring follow.** Growth animates the scroll position with a damped spring by default; passing
  `'instant'` (or an animation resolving to it) snaps immediately instead.
- **Selection guard, including shadow DOM.** While the pointer is down and a text selection
  overlaps the viewport, scroll adjustments pause so a drag-select isn't yanked out from under
  the user. Selection is read through the viewport's own root node, so it works the same inside a
  shadow root as it does in light DOM.

## License

MIT, see [LICENSE](./LICENSE). Includes the upstream `use-stick-to-bottom` copyright notice.
