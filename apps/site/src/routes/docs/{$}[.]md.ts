import {createFileRoute} from '@tanstack/react-router'
import {markdownPathToSlugs} from '@/lib/docs-paths'
import {getDocsMarkdown} from '@/lib/docs.functions'

export const Route = createFileRoute('/docs/{$}.md')({
  server: {
    handlers: {
      GET: async ({params}) => {
        const slugs = markdownPathToSlugs(params._splat?.split('/') ?? [])
        const markdown = await getDocsMarkdown({data: slugs})
        if (markdown === null) return new Response('Not found', {status: 404, headers: {'Content-Type': 'text/plain'}})

        return new Response(markdown, {
          headers: {
            'Content-Type': 'text/markdown',
          },
        })
      },
    },
  },
})
