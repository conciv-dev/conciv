import {defineConfig, defineDocs} from 'fumadocs-mdx/config'
import {rehypeCodeDefaultOptions, remarkMdxMermaid} from 'fumadocs-core/mdx-plugins'
import {transformerTwoslash} from 'fumadocs-twoslash'
import {createFileSystemGeneratorCache, createGenerator, remarkAutoTypeTable} from 'fumadocs-typescript'

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    postprocess: {
      includeProcessedMarkdown: {output: 'string'},
    },
  },
})

const generator = createGenerator({
  cache: createFileSystemGeneratorCache('.cache/fumadocs-typescript'),
})

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMdxMermaid, [remarkAutoTypeTable, {generator}]],
    rehypeCodeOptions: {
      ...rehypeCodeDefaultOptions,
      transformers: [
        ...(rehypeCodeDefaultOptions.transformers ?? []),
        transformerTwoslash({twoslashOptions: {compilerOptions: {types: ['node']}}}),
      ],
    },
  },
})
