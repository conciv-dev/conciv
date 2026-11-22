import {presetConciv} from '@conciv/uno-preset'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'unocss'

export default defineConfig({
  content: {
    pipeline: {include: [/\.tsx?($|\?)/]},
    filesystem: [
      'src',
      '../../packages/ui-kit-chat/src',
      '../../packages/ui-kit-chat-tools/src',
      '../../packages/ui-kit-system/src',
      '../../packages/ui-kit-terminal/src',
      '../../packages/ui-kit-tap/src',
      '../../packages/tools/src',
      '../../packages/core/src/cards',
      '../../packages/plugins/page/src',
      '../../packages/plugins/recorder/src',
      '../../packages/plugins/test-runner/src',
      '../../packages/plugins/tanstack/src',
      '../../packages/plugins/terminal/src',
      '../../packages/plugins/whiteboard/src',
    ]
      .map((source) => fileURLToPath(new URL(source, import.meta.url)))
      .flatMap((source) => [`${source}/**/*.{ts,tsx}`, `!${source}/**/*.{test,spec,stories}.*`]),
  },

  presets: [presetConciv()],
})
