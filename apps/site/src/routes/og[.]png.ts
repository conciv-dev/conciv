import {createFileRoute} from '@tanstack/react-router'
import {DEFAULT_DESCRIPTION, DEFAULT_TITLE} from '@/lib/site-urls'

export const Route = createFileRoute('/og.png')({
  server: {
    handlers: {
      GET: async ({request}) => {
        const {renderOgImageResponse, OG_IMAGE_CACHE_HEADERS} = await import('@/lib/og-render.server')
        return renderOgImageResponse({title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION}, request.url, {
          headers: OG_IMAGE_CACHE_HEADERS,
        })
      },
    },
  },
})
