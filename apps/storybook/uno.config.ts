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
      '../../apps/conciv/src/pane/cards/**/*.{ts,tsx}',
      '../../packages/plugins/*/src/**/*.{ts,tsx}',
    ],
  },
  presets: [presetConciv()],
})
