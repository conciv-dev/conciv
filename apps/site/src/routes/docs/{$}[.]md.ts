import {createFileRoute, notFound} from '@tanstack/react-router'
import {getLLMText, markdownPathToSlugs, source} from '@/lib/source'
import {docsEnabled} from '@/lib/shared'

export const Route = createFileRoute('/docs/{$}.md')({
  server: {
    handlers: {
      GET: async ({params}) => {
        if (!docsEnabled) throw notFound()
        const slugs = markdownPathToSlugs(params._splat?.split('/') ?? [])
        const page = source.getPage(slugs)
        if (!page) throw notFound()

        return new Response(await getLLMText(page), {
          headers: {
            'Content-Type': 'text/markdown',
          },
        })
      },
    },
  },
})
