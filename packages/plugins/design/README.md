# @conciv/plugin-design

The conciv design plugin. It joins the Figma design, the page's DOM and CSSOM and the source into one id tree.

```ts
plugins: ['@conciv/plugin-design']
```

The options are the design check's settings: `comparator`, `color`, `pairer`, `ranker`, `text`, `segmenter`, `roles`,
`blind`, `show`, `catalog` and `hotkeys`. A value the schema refuses fails the plugin's activation with
`design.INVALID_OPTIONS`.

## Invariants

- `build` is `tsdown && vite build`: `tsdown.config.ts` emits the engine JavaScript and its declarations and the
  browser part's declarations, then `vite.config.ts` builds the browser part (`./plugin-experimental`) with
  `experimental()`.

## Side Effects

- `build` script (`package.json`): writes dist/
