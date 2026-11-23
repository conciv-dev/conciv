import {presetConciv} from '@conciv/uno-preset'
import {defineConfig} from 'unocss'

export default defineConfig({
  content: {
    pipeline: {include: [/\.tsx?($|\?)/]},
    filesystem: [
      ...[
        'src',
        '../../apps/conciv/src',
        '../ui-kit-chat/src',
        '../ui-kit-chat-tools/src',
        '../ui-kit-system/src',
        '../ui-kit-terminal/src',
        '../ui-kit-tap/src',
        '../tools/src',
        '../core/src/cards',
        '../plugins/*/src',
      ].flatMap((source) => [`${source}/**/*.{ts,tsx}`, `!${source}/**/*.{test,spec,stories}.*`]),
      '../core/src/cards.tsx',
    ],
  },

  presets: [presetConciv()],
})
