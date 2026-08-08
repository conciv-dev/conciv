import type {StorybookConfig} from 'storybook-solidjs-vite'

const config: StorybookConfig = {
  stories: [
    '../../../packages/ui-kit-system/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    '../../../packages/ui-kit-chat/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    '../../../packages/ui-kit-chat-tools/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    '../../../packages/ui-kit-tap/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    '../../../packages/solid-diffs/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    '../../../packages/solid-streamdown/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
  addons: ['@chromatic-com/storybook', '@storybook/addon-vitest', '@storybook/addon-a11y', '@storybook/addon-docs'],
  framework: process.env.VITEST ? {name: 'storybook-solidjs-vite', options: {docgen: false}} : 'storybook-solidjs-vite',
  async viteFinal(storybookViteConfig) {
    const {mergeConfig} = await import('vite')
    return mergeConfig(storybookViteConfig, {
      resolve: {dedupe: ['solid-js', 'solid-js/web', '@ark-ui/solid']},
      optimizeDeps: {
        include: [
          'lucide-solid',
          '@tanstack/ai-solid',
          '@tanstack/ai-client',
          '@tanstack/solid-virtual',
          '@tiptap/core',
          '@tiptap/pm/state',
          '@tiptap/pm/view',
          '@tiptap/extension-document',
          '@tiptap/extension-paragraph',
          '@tiptap/extension-text',
          '@tiptap/extension-hard-break',
          '@tiptap/extension-mention',
          'unified',
          'remark-parse',
          'remark-rehype',
          'remark-gfm',
          'remend',
          'marked',
          'rehype-harden',
          'rehype-raw',
          'rehype-sanitize',
          'unist-util-visit-parents',
        ],
        exclude: ['solid-js', 'solid-js/web', 'solid-js/store', '@ark-ui/solid'],
      },
    })
  },
}
export default config
