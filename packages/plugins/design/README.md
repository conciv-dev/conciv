# @conciv/plugin-design

The conciv design plugin. It joins the Figma design, the page's DOM and CSSOM and the source into one id tree.

```ts
plugins: ['@conciv/plugin-design']
```

The options are the design check's settings: `comparator`, `color`, `pairer`, `ranker`, `text`, `segmenter`, `roles`,
`blind`, `show`, `catalog` and `hotkeys`. A value the schema refuses fails the plugin's activation with
`design.INVALID_OPTIONS`.

## Invariants

- One `vite build` (`pnpm build`) emits all three outputs: the engine JavaScript and its declarations through the
  `libConfig` environments, and the browser part (`./plugin-experimental`) through `experimental()`.

## Side Effects

- `build` script (`package.json`): writes dist/
