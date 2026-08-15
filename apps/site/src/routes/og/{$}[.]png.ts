import {createFileRoute} from '@tanstack/react-router'
import {markdownPathToSlugs, source} from '@/lib/source'

export const Route = createFileRoute('/og/{$}.png')({
  server: {
    handlers: {
      GET: async ({params, request}) => {
        const slug = (params._splat ?? '').replace(/\.png$/, '')
        const slugs = markdownPathToSlugs(slug.split('/'))
        const page = source.getPage(slugs)
        if (!page) return new Response('Not found', {status: 404})

        const {renderOgImageResponse, OG_IMAGE_CACHE_HEADERS} = await import('@/lib/og-render.server')
        return renderOgImageResponse({title: page.data.title, description: page.data.description}, request.url, {
          headers: OG_IMAGE_CACHE_HEADERS,
        })
      },
    },
  },
})
