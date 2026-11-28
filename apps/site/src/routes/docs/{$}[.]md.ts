import {createFileRoute} from '@tanstack/react-router'
import {markdownPathToSlugs} from '@/lib/docs-paths'
import {docsMarkdownResponse} from '@/lib/docs-markdown-response'

export const Route = createFileRoute('/docs/{$}.md')({
  server: {
    handlers: {
      GET: ({params}) => docsMarkdownResponse(markdownPathToSlugs(params._splat?.split('/') ?? [])),
    },
  },
})
