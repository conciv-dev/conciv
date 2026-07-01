import {presetAidx} from '@mandarax/uno-preset'
import {defineConfig} from 'unocss'

export default defineConfig({
  // Scan this kit plus the ui-kit-system source it reuses (Avatar), so Storybook renders both styled.
  content: {filesystem: ['src/**/*.{ts,tsx}', '../ui-kit-system/src/**/*.{ts,tsx}']},
  presets: [presetAidx()],
})
