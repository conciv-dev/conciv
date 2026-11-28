import {createFileRoute, notFound} from '@tanstack/react-router'
import {markdownPathToSlugs} from '@/lib/docs-paths'
import {getDocsMarkdown} from '@/lib/docs.functions'

export const Route = createFileRoute('/docs/{$}.md')({
  server: {
    handlers: {
      GET: async ({params}) => {
        const slugs = markdownPathToSlugs(params._splat?.split('/') ?? [])
        const markdown = await getDocsMarkdown({data: slugs})
        if (markdown === null) throw notFound()

        return new Response(markdown, {
          headers: {
            'Content-Type': 'text/markdown',
          },
        })
      },
    },
  },
})
