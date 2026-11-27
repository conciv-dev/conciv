import {defineConfig, defineDocs} from 'fumadocs-mdx/config'
import {pageSchema} from 'fumadocs-core/source/schema'
import {z} from 'zod'
import {rehypeCodeDefaultOptions, remarkMdxMermaid, remarkStructureDefaultOptions} from 'fumadocs-core/mdx-plugins'
import {transformerTwoslash} from 'fumadocs-twoslash'
import {createFileSystemTypesCache} from 'fumadocs-twoslash/cache-fs'
import {remarkAutoTypeTable} from 'fumadocs-typescript'
import {createReferenceGenerator} from './src/lib/reference-type-table'

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema.extend({label: z.string().optional()}),
    postprocess: {
      includeProcessedMarkdown: {output: 'string'},
    },
  },
})

export default defineConfig({
  mdxOptions: {
    remarkStructureOptions: {types: [...remarkStructureDefaultOptions.types, 'code']},
    remarkPlugins: [remarkMdxMermaid, [remarkAutoTypeTable, {generator: createReferenceGenerator()}]],
    rehypeCodeOptions: {
      ...rehypeCodeDefaultOptions,
      langs: ['ts', 'tsx', 'js', 'json', 'bash', 'md', 'mdx', 'swift'],
      transformers: [
        ...(rehypeCodeDefaultOptions.transformers ?? []),
        transformerTwoslash({
          typesCache: createFileSystemTypesCache({dir: '.cache/twoslash'}),
          twoslashOptions: {compilerOptions: {types: ['node']}},
          rendererRich: {processHoverDocs: (text) => text.split(/\n\s*\n/, 1)[0] ?? text},
        }),
      ],
    },
  },
})
