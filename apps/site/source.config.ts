import {defineConfig, defineDocs} from 'fumadocs-mdx/config'
import {remarkMdxMermaid} from 'fumadocs-core/mdx-plugins'

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
})

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMdxMermaid],
    rehypeCodeOptions: {themes: {light: 'github-light-high-contrast', dark: 'github-dark'}},
  },
})
