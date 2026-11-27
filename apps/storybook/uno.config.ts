import {presetConciv} from '@internal/uno-preset'
import {defineConfig} from 'unocss'

export default defineConfig({
  content: {
    filesystem: [
      '../../packages/brand/src/**/*.{ts,tsx}',
      '../../packages/ui-kit-system/src/**/*.{ts,tsx}',
      '../../packages/ui-kit-chat/src/**/*.{ts,tsx}',
      '../../packages/ui-kit-chat-tools/src/**/*.{ts,tsx}',
      '../../packages/ui-kit-tap/src/**/*.{ts,tsx}',
    ],
  },
  presets: [presetConciv()],
})
