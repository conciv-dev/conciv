import {defineErrorCatalog} from 'evlog'

export const siteErrors = defineErrorCatalog('site', {
  DOCS_ICON_UNKNOWN: {
    message: ({name}: {name: string}) => `docs icon "${name}" is not in docsIcons`,
    fix: 'Add the lucide icon to docsIcons in apps/site/src/lib/source.ts.',
  },
  OG_FONT_NOT_LOADED: {
    message: ({path, status}: {path: string; status: number}) => `Failed to load OG font ${path}: ${status}`,
  },
  BRAND_ASSET_MISSING: {
    status: 404,
    message: ({path}: {path: string}) => `No brand asset emitted for ${path}`,
  },
  SVG_NOT_LOADED: {
    message: ({status}: {status: number}) => `The SVG could not be loaded: ${status}`,
  },
  COPY_BUTTON_OUTSIDE_ROOT: {message: 'CopyButton.* must be used inside CopyButton.Root'},
  FRAMEWORK_TABS_OUTSIDE_ROOT: {message: 'FrameworkTabs.* must be used inside FrameworkTabs.Root'},
  TRY_IT_NO_SETUP: {message: 'conciv try-it plugin has no setup'},
  LOCAL_MODEL_RUN_FAILED: {
    message: ({reason}: {reason: string}) => reason,
  },
  MODEL_OUTPUT_NOT_JSON: {
    message: ({output}: {output: string}) => `no JSON object in output:\n${output}`,
  },
  PROMPT_NOT_STRING: {message: 'chat template did not produce a string prompt'},
  GENERATION_NOT_TEXT: {message: 'model returned a non-text generation'},
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    site: typeof siteErrors
  }
}
