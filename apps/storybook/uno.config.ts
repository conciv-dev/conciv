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
      '../../packages/extensions/page/src/**/*.{ts,tsx}',
      '../../packages/extensions/tanstack/src/**/*.{ts,tsx}',
      '../../packages/extensions/recorder/src/**/*.{ts,tsx}',
      '../../packages/extensions/whiteboard/src/**/*.{ts,tsx}',
    ],
  },
  presets: [presetConciv()],
})
