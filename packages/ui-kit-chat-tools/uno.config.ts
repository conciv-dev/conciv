import {presetAidx} from '@conciv/uno-preset'
import {defineConfig} from 'unocss'

export default defineConfig({
  // Scan this package + the building blocks it renders through (ui-kit-chat's CollapsibleCard/ToolCard
  // + ui-kit-system primitives ship JS only, so their utilities come from these globs).
  content: {
    filesystem: ['src/**/*.{ts,tsx}', '../ui-kit-chat/src/**/*.{ts,tsx}', '../ui-kit-system/src/**/*.{ts,tsx}'],
  },
  presets: [presetAidx()],
})
