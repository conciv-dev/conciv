import {presetConciv} from '@conciv/uno-preset'
import {defineConfig} from 'unocss'

export default defineConfig({
  content: {
    pipeline: {include: [/\.tsx?($|\?)/]},
    filesystem: [
      'src/**/*.{ts,tsx}',
      '../../packages/builtin-plugins/src/**/*.{ts,tsx}',
      '../../packages/ui-kit-chat/src/**/*.{ts,tsx}',
      '../../packages/ui-kit-chat-tools/src/**/*.{ts,tsx}',
      '../../packages/ui-kit-system/src/**/*.{ts,tsx}',
      '../../packages/ui-kit-terminal/src/**/*.{ts,tsx}',
      '../../packages/ui-kit-tap/src/**/*.{ts,tsx}',
      '../../packages/tools/src/**/*.{ts,tsx}',
      '../../packages/core/src/cards/**/*.{ts,tsx}',
      '../../packages/builtin-plugins/src/**/*.{ts,tsx}',
      '../../packages/extensions/whiteboard/src/**/*.{ts,tsx}',
      '../../packages/plugins/test-runner/src/**/*.{ts,tsx}',
      '../../packages/plugins/tanstack/src/**/*.{ts,tsx}',
      '../../packages/plugins/whiteboard/src/**/*.{ts,tsx}',
    ],
  },

  presets: [presetConciv()],
})
