import type {StorybookConfig} from 'storybook-solidjs-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@chromatic-com/storybook', '@storybook/addon-vitest', '@storybook/addon-a11y', '@storybook/addon-docs'],
  framework: 'storybook-solidjs-vite',
  // Pre-bundle the heavy ESM deps the cards pull in (Ark ScrollArea, the virtualizer, the per-icon
  // lucide modules) so the dev server optimizes them once at startup instead of stalling on first
  // navigation to the story that uses them. solid-js stays excluded so the Solid plugin handles it.
  async viteFinal(storybookViteConfig) {
    const {mergeConfig} = await import('vite')
    return mergeConfig(storybookViteConfig, {
      optimizeDeps: {
        include: ['@ark-ui/solid/scroll-area', '@tanstack/solid-virtual', 'lucide-solid'],
        exclude: ['solid-js', 'solid-js/web', 'solid-js/store'],
      },
    })
  },
}
export default config
