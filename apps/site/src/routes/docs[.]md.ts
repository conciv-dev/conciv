import {createFileRoute} from '@tanstack/react-router'
import {docsMarkdownResponse} from '@/lib/docs-markdown-response'

export const Route = createFileRoute('/docs.md')({
  server: {
    handlers: {
      GET: () => docsMarkdownResponse([]),
    },
  },
})
