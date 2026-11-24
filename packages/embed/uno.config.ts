import {presetConciv} from '@conciv/uno-preset'
import {defineConfig} from 'unocss'

export default defineConfig({
  content: {
    pipeline: {include: [/\.tsx?($|\?)/]},
    filesystem: [
      'src',
      '../../apps/conciv/src',
      '../ui-kit-chat/src',
      '../ui-kit-chat-tools/src',
      '../ui-kit-system/src',
      '../ui-kit-tap/src',
      '../tools/src',
      '../plugins/*/src',
    ].flatMap((source) => [`${source}/**/*.{ts,tsx}`, `!${source}/**/*.{test,spec,stories}.*`]),
  },

  presets: [presetConciv()],
})
