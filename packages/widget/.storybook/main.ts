import type {StorybookConfig} from 'storybook-solidjs-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@chromatic-com/storybook', '@storybook/addon-vitest', '@storybook/addon-a11y', '@storybook/addon-docs'],
  framework: 'storybook-solidjs-vite',
  // solid-js stays excluded from dep-optimization so the Solid plugin owns its transform (prebundling
  // it would strip the reactive runtime). Other deps are optimized on-demand by Vite as stories import
  // them — no eager include list (bare Solid packages like @ark-ui/solid can't be prebundled anyway).
  async viteFinal(storybookViteConfig) {
    const {mergeConfig} = await import('vite')
    return mergeConfig(storybookViteConfig, {
      optimizeDeps: {exclude: ['solid-js', 'solid-js/web', 'solid-js/store']},
    })
  },
}
export default config
