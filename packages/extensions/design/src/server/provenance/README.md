# design/src/server/provenance

## Overview

Each ProvenanceMapper has `applies(input)` and `map(input)`. `mapDeclaration` tries the mappers in order and returns the first result that is not 'unknown'. JSX-based mappers parse the component's source file with oxc-parser and find the JSX opening element at the recorded line and column. The CSS map is built with postcss from the given stylesheet files. DELTA_PROPERTIES lists the candidate CSS properties for each delta kind.

## Interface

- `MAPPERS` (`mappers.ts`): ordered list [styleMapper, libraryMapper, classNameMapper, cssMapper, emotionMapper, styledMapper]
- `mapDeclaration` (`mappers.ts`): runs the applicable mappers in order and returns the first non-unknown Provenance, or UNKNOWN
- `styleMapper` (`style.ts`): via 'style'/'sx'; finds the last covering key in the style or sx object literal and can suggest a theme spacing value
- `libraryMapper` (`library.ts`): via 'library'; flags library stylesheets and looks for a `createTheme` components.<slot>.styleOverrides override under cwd/src
- `classNameMapper` (`classname.ts`): via 'className'; finds the location of a class token in className literals, templates, clsx/cn calls or local consts
- `cssMapper` (`css.ts`): via 'css'; looks up selector and property in the CssMap
- `emotionMapper` (`emotion.ts`): via 'emotion'; returns the component file and selector
- `styledMapper` (`styled.ts`): via 'styled'; returns the component file and selector
- `buildCssMap` (`css-map.ts`): parses CSS files with postcss into a CssMap whose `find({selector, property})` returns the last matching declaration
- `countDeclarations` (`css-map.ts`): counts declarations in rules whose selector exactly matches
- `DELTA_PROPERTIES` (`delta-properties.ts`): candidate CSS properties per DeltaKindName (satisfies Record<DeltaKindName, Candidates>)
- `PARENT_PROPERTIES` (`delta-properties.ts`): ['gap']
- `UNKNOWN`, `parseFile`, `readSite`, `findAttribute`, `located`, `positionAt`, `camelToKebab`, `Parsed`, `Site` (`jsx.ts`): oxc-parser helpers for locating JSX elements and attributes

## Invariants

- mapDeclaration skips mappers whose `applies` is false and keeps going while results are 'unknown' (`mapDeclaration`, `mappers.ts`)
- parseFile returns null on a read failure or any parse errors; files ending .tsx/.jsx are parsed as tsx, all others as ts (`parseFile`, `jsx.ts`)
- readSite returns null unless a JSXOpeningElement starts exactly at the source line and column offset (`readSite`, `jsx.ts`)
- styleMapper checks 'style' then 'sx' when the winner is inline, and only 'sx' for emotion (`styleMapper`, `style.ts`)
- fromObject returns UNKNOWN if a spread element follows the matched key (`styleMapper`, `style.ts`)
- An sx suggestion requires a numeric literal value, a SPACING_KEYS key, a numeric target, a px live value, and a positive unit that divides the target evenly (`styleMapper`, `style.ts`)
- classNameMapper applies only to a single class selector without delimiter characters; it follows clsx/cn calls and const identifiers with cycle protection, and returns UNKNOWN when the CSS rule has more than 1 declaration (`classNameMapper`, `classname.ts`)
- libraryMapper treats a sheet as library if its path contains `LIBRARY_SHEET_MARKER` or its viteDevId resolves outside cwd (`libraryMapper`, `library.ts`)
- themeOverride needs a '.slot-name' selector and scans only .ts/.tsx under cwd/src, excluding node_modules, in files containing 'createTheme' (`libraryMapper`, `library.ts`)
- The CSS map matches selectors exactly, and in .module.css files it also matches hashed '._local_' names by their local part; the last match wins (`buildCssMap`, `css-map.ts`)
- Unparseable CSS files are ignored (null root), and only declarations directly inside rules are indexed (`buildCssMap`, `css-map.ts`)

## Side Effects

- Reads component source files from disk (`readSite`/`parseFile`, `jsx.ts`)
- Reads CSS files from disk (`buildCssMap`, `countDeclarations`, `css-map.ts`)
- Recursively reads cwd/src and parses .ts/.tsx files when looking for theme overrides (`libraryMapper`, `library.ts`)

## Verification

- Run: `cd packages/extensions/design && pnpm typecheck && pnpm lint` (the package has no `test` script)
