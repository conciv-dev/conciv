import {presetConciv} from '@internal/uno-preset'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'unocss'

export default defineConfig({
  content: {
    pipeline: {include: [/\.tsx?($|\?)/]},
    filesystem: [
      'src',
      '../ui-kit-chat/src',
      '../ui-kit-chat-tools/src',
      '../ui-kit-system/src',
      '../ui-kit-tap/src',
      '../frontend-app-api/src',
      '../ui-kit-chat-tools/src/core-cards',
    ]
      .map((source) => fileURLToPath(new URL(source, import.meta.url)))
      .flatMap((source) => [`${source}/**/*.{ts,tsx}`, `!${source}/**/*.{test,spec,stories}.*`])
      .concat(fileURLToPath(new URL('../ui-kit-chat-tools/src/core-cards.tsx', import.meta.url))),
  },

  presets: [presetConciv()],
})
