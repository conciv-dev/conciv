import {presetAidx} from '@mandarax/uno-preset'
import {defineConfig} from 'unocss'

export default defineConfig({
  // @unocss/postcss scans these globs for utility classes (it doesn't walk the module graph). The
  // widget owns its shadow CSS and is the single place all utilities are generated: its OWN src plus
  // the source of every workspace package it renders — tool-ui's cards, the ui-kit-system primitives,
  // and the whiteboard extension's shadow-DOM overlay. All ship JS only (no per-package CSS), so their
  // utilities come from these globs.
  content: {
    filesystem: [
      'src/**/*.{ts,tsx}',
      '../ui-kit-chat/src/**/*.{ts,tsx}',
      '../ui-kit-chat-tools/src/**/*.{ts,tsx}',
      '../ui-kit-system/src/**/*.{ts,tsx}',
      '../ui-kit-tap/src/**/*.{ts,tsx}',
      '../extensions/whiteboard/src/**/*.{ts,tsx}',
    ],
  },
  // presets/theme/shortcuts come from the shared @mandarax/uno-preset (one source of truth). See its
  // src/index.ts for the presetMini/typography/sr-only rationale.
  presets: [presetAidx()],
})
