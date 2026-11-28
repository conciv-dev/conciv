import {createServerFn} from '@tanstack/react-start'
import {llms} from 'fumadocs-core/source'
import {createFromSource} from 'fumadocs-core/search/server'
import {z} from 'zod'
import {getLLMText, source} from '@/lib/source'

const SearchInputSchema = z.object({
  query: z.string(),
  tag: z.array(z.string()).optional(),
  limit: z.number().int().positive().optional(),
})

const searchServer = createFromSource(source, {language: 'english'})

export const getLlmsIndex = createServerFn({method: 'GET'}).handler(() => llms(source).index())

export const getLlmsFullText = createServerFn({method: 'GET'}).handler(async () =>
  (await Promise.all(source.getPages().map(getLLMText))).join('\n\n'),
)

export const getDocsMarkdown = createServerFn({method: 'GET'})
  .validator((slugs: string[]) => slugs)
  .handler(async ({data: slugs}) => {
    const page = source.getPage(slugs)
    return page === undefined ? null : getLLMText(page)
  })

export const getDocsMeta = createServerFn({method: 'GET'})
  .validator((slugs: string[]) => slugs)
  .handler(({data: slugs}) => {
    const page = source.getPage(slugs)
    return page === undefined ? null : {title: page.data.title, description: page.data.description}
  })

export const getDocsUrls = createServerFn({method: 'GET'}).handler(() => source.getPages().map((page) => page.url))

export const searchDocs = createServerFn({method: 'GET'})
  .validator((input: unknown) => SearchInputSchema.parse(input))
  .handler(({data: {query, tag, limit}}) => searchServer.search(query, {tag, limit}))
