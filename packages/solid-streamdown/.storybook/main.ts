import type {StorybookConfig} from 'storybook-solidjs-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@chromatic-com/storybook', '@storybook/addon-vitest', '@storybook/addon-a11y', '@storybook/addon-docs'],
  framework: 'storybook-solidjs-vite',
  // The unified/remark/micromark stack pulls several legacy CJS deps (debug, extend, style-to-object,
  // …) that lack an ESM default export and break in the browser. Pre-bundle the markdown pipeline
  // packages so esbuild inlines their whole transitive tree with CJS interop, handling every leaf at
  // once. solid-js/solid-jsx stay excluded so the Solid runtime/plugin handle them.
  async viteFinal(storybookViteConfig) {
    const {mergeConfig} = await import('vite')
    return mergeConfig(storybookViteConfig, {
      optimizeDeps: {
        include: ['unified', 'remark-parse', 'remark-rehype', 'remark-gfm', 'remend'],
        exclude: ['solid-js', 'solid-jsx'],
      },
    })
  },
}
export default config
