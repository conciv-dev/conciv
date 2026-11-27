# @conciv/plugin-design

The conciv design plugin. It joins the Figma design, the page's DOM and CSSOM and the source into one id tree.

```ts
plugins: ['@conciv/plugin-design']
```

The options are the design check's settings: `comparator`, `color`, `pairer`, `ranker`, `text`, `segmenter`, `roles`,
`blind`, `show`, `catalog` and `hotkeys`. A value the schema refuses fails the plugin's activation with
`Design.InvalidOptions`.

## Invariants

- tsdown emits the engine JavaScript (`dts: false`), `vite build` the browser part (`./plugin-experimental`), and
  `tsc -p tsconfig.build.json` the declarations.

## Side Effects

- `build` script (`package.json`): writes dist/
