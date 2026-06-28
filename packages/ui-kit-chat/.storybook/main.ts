import type {StorybookConfig} from 'storybook-solidjs-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@chromatic-com/storybook', '@storybook/addon-vitest', '@storybook/addon-a11y', '@storybook/addon-docs'],
  framework: 'storybook-solidjs-vite',
  // Pre-bundle the heavy ESM deps the chat primitives pull in (Ark headless hooks, the virtualizer,
  // tanstack ai runtime, per-icon lucide modules) so the dev server optimizes them once at startup.
  // solid-js stays excluded so the Solid plugin owns it.
  async viteFinal(storybookViteConfig) {
    const {mergeConfig} = await import('vite')
    return mergeConfig(storybookViteConfig, {
      resolve: {dedupe: ['solid-js', 'solid-js/web', '@ark-ui/solid']},
      optimizeDeps: {
        include: ['@tanstack/ai-solid', '@tanstack/ai-client', '@tanstack/solid-virtual', 'lucide-solid'],
        exclude: ['solid-js', 'solid-js/web', 'solid-js/store', '@ark-ui/solid'],
      },
    })
  },
}
export default config
