import {defineConfig, defineDocs} from 'fumadocs-mdx/config'
import {remarkMdxMermaid} from 'fumadocs-core/mdx-plugins'

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    postprocess: {
      includeProcessedMarkdown: {output: 'string'},
    },
  },
})

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMdxMermaid],
  },
})
