import type {StorybookConfig} from 'storybook-solidjs-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@chromatic-com/storybook', '@storybook/addon-vitest', '@storybook/addon-a11y', '@storybook/addon-docs'],
  framework: 'storybook-solidjs-vite',
  async viteFinal(storybookViteConfig) {
    const {mergeConfig} = await import('vite')
    return mergeConfig(storybookViteConfig, {
      resolve: {dedupe: ['solid-js', 'solid-js/web', '@ark-ui/solid']},
      optimizeDeps: {
        include: ['@tanstack/ai-client', 'aria-query', 'lucide-solid'],
        exclude: ['solid-js', 'solid-js/web', 'solid-js/store', '@ark-ui/solid'],
      },
    })
  },
}
export default config
