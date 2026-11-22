import {presetConciv} from '@conciv/uno-preset'
import {defineConfig} from 'unocss'

export default defineConfig({
  content: {
    filesystem: [
      'src/**/*.{ts,tsx}',
      '!src/**/*.{test,spec,stories}.*',
      '../ui-kit-chat/src/**/*.{ts,tsx}',
      '!../ui-kit-chat/src/**/*.{test,spec,stories}.*',
      '../ui-kit-system/src/**/*.{ts,tsx}',
      '!../ui-kit-system/src/**/*.{test,spec,stories}.*',
    ],
    pipeline: {include: [/\.[jt]sx?($|\?)/]},
  },
  presets: [presetConciv()],
})
