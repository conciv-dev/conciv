# @conciv/solid-streamdown

## 0.0.20

### Patch Changes

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Code blocks in chat replies no longer flip between plain and colored text while a reply streams in: lines that are already colored stay colored and only the newly arrived code is added. Selecting text inside a code block now survives the reply re-rendering around it, so you can copy from a block while the agent is still writing.

- [#546](https://github.com/conciv-dev/conciv/pull/546) [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51) Thanks [@omridevk](https://github.com/omridevk)! - Stop streamed text from flickering. Each markdown block is now a keyed node tree held in a store and reconciled by key, so words that have already settled keep their DOM node and never replay their fade; only newly mounted words animate in. The old character-counting animate plugin, its stagger variables, and the `createImmutable` hast wrapper are gone. The streaming answer also drops `text-wrap: pretty`, which re-balanced line breaks as text grew and moved settled words between lines; settled answers keep it.

- [#546](https://github.com/conciv-dev/conciv/pull/546) [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51) Thanks [@omridevk](https://github.com/omridevk)! - Fix a crash (`TypeError: Reflect.ownKeys called on non-object`) that could occur mid-stream when markdown structure changes character by character (an unclosed `**bold**`/link/inline-code marker completing, or paragraphs splitting/merging). The hast tree built for each block is now normalized to a uniform node shape (`children`/`properties` always present, even on text nodes) before being handed to `createImmutable`, so a position that changes from a text node to an element (or back) between parses never hands the reactive wrapper's internal traps a value it can't call `Reflect.ownKeys` on. Node identity and style stability are unchanged.

- [#546](https://github.com/conciv-dev/conciv/pull/546) [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51) Thanks [@omridevk](https://github.com/omridevk)! - Fix a residual DOM-churn source left after the hast-identity fix: the animate plugin recomputed each word's `skipAnimation`/`delay` from `prevContentLength` on every parse, so a word transitioned from its animating style to its settled style with one attribute write per word (42k+ style writes in one measured streaming turn). The plugin now resolves each word's animation decision once, keyed by its position, and reuses it on every later parse, so already-rendered spans are never rewritten. New words still fade in and stagger exactly as before.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - A reply that stops streaming without a final text change settles to plain text nodes instead of keeping its per-word spans.

## 0.0.19

## 0.0.18

## 0.0.17

## 0.0.16

## 0.0.15

## 0.0.14

## 0.0.13

## 0.0.12

## 0.0.11

### Patch Changes

- [#74](https://github.com/conciv-dev/conciv/pull/74) [`5f76cc2`](https://github.com/conciv-dev/conciv/commit/5f76cc2d14ae93265f8c72b3eb6d5254abe3bb59) Thanks [@omridevk](https://github.com/omridevk)! - Import rehype-raw and rehype-sanitize statically, matching upstream streamdown. Raw HTML support no longer loads a separate async chunk when `allowRawHtml` is enabled.

## 0.0.10

## 0.0.9

## 0.0.8

## 0.0.7

## 0.0.6

## 0.0.5

### Patch Changes

- [`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139) Thanks [@omridevk](https://github.com/omridevk)! - new version with fixed deps

## 0.0.4

## 0.0.3

## 0.0.2

## 0.0.1
