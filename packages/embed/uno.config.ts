import {presetConciv} from '@conciv/uno-preset'
import {defineConfig} from 'unocss'

export default defineConfig({
  content: {
    filesystem: [
      'src/**/*.{ts,tsx}',
      '../../apps/conciv/src/**/*.{ts,tsx}',
      '../ui-kit-chat/src/**/*.{ts,tsx}',
      '../ui-kit-chat-tools/src/**/*.{ts,tsx}',
      '../ui-kit-system/src/**/*.{ts,tsx}',
      '../ui-kit-terminal/src/**/*.{ts,tsx}',
      '../ui-kit-tap/src/**/*.{ts,tsx}',
      '../extensions/terminal/src/**/*.{ts,tsx}',
      '../extensions/whiteboard/src/**/*.{ts,tsx}',
    ],
  },

  presets: [presetConciv()],
})
