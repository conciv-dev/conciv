import {presetConciv} from '@internal/uno-preset'
import {defineConfig} from 'unocss'

export default defineConfig({
  content: {
    pipeline: {include: [/\.tsx?($|\?)/]},
    filesystem: [
      ...[
        'src',
        '../frontend-defaults/src',
        '../ui-kit-chat/src',
        '../ui-kit-chat-tools/src',
        '../ui-kit-system/src',
        '../ui-kit-terminal/src',
        '../ui-kit-tap/src',
        '../frontend-app-api/src',
        '../ui-kit-chat-tools/src/core-cards',
        '../plugins/*/src',
      ].flatMap((source) => [`${source}/**/*.{ts,tsx}`, `!${source}/**/*.{test,spec,stories}.*`]),
      '../ui-kit-chat-tools/src/core-cards.tsx',
    ],
  },

  presets: [presetConciv()],
})
