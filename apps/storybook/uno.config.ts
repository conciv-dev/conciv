import {presetConciv} from '@conciv/uno-preset'
import {defineConfig} from 'unocss'

export default defineConfig({
  content: {
    filesystem: [
      '../../packages/brand/src/**/*.{ts,tsx}',
      '../../packages/ui-kit-system/src/**/*.{ts,tsx}',
      '../../packages/ui-kit-chat/src/**/*.{ts,tsx}',
      '../../packages/ui-kit-chat-tools/src/**/*.{ts,tsx}',
      '../../packages/ui-kit-tap/src/**/*.{ts,tsx}',
      '../../packages/tools/src/**/*.{ts,tsx}',
      '../../packages/core/src/cards/**/*.{ts,tsx}',
      '../../packages/builtin-plugins/src/**/*.{ts,tsx}',
      '../../packages/extensions/tanstack/src/**/*.{ts,tsx}',
      '../../packages/extensions/whiteboard/src/**/*.{ts,tsx}',
      '../../packages/plugins/test-runner/src/**/*.{ts,tsx}',
    ],
  },
  presets: [presetConciv()],
})
