import {presetConciv} from '@conciv/uno-preset'
import {defineConfig} from 'unocss'

export default defineConfig({
  content: {
    pipeline: {include: [/\.tsx?($|\?)/]},
    filesystem: [
      'src/**/*.{ts,tsx}',
      '../../apps/conciv/src/**/*.{ts,tsx}',
      '../builtin-plugins/src/**/*.{ts,tsx}',
      '../ui-kit-chat/src/**/*.{ts,tsx}',
      '../ui-kit-chat-tools/src/**/*.{ts,tsx}',
      '../ui-kit-system/src/**/*.{ts,tsx}',
      '../ui-kit-terminal/src/**/*.{ts,tsx}',
      '../ui-kit-tap/src/**/*.{ts,tsx}',
      '../tools/src/**/*.{ts,tsx}',
      '../core/src/cards.tsx',
      '../core/src/cards/**/*.{ts,tsx}',
      '../builtin-plugins/src/**/*.{ts,tsx}',
      '../extensions/whiteboard/src/**/*.{ts,tsx}',
      '../extensions/recorder/src/**/*.{ts,tsx}',
      '../plugins/test-runner/src/**/*.{ts,tsx}',
      '../plugins/tanstack/src/**/*.{ts,tsx}',
      '../plugins/whiteboard/src/**/*.{ts,tsx}',
      '../plugins/try-it/src/**/*.{ts,tsx}',
      '../plugins/ios/src/client.tsx',
    ],
  },

  presets: [presetConciv()],
})
