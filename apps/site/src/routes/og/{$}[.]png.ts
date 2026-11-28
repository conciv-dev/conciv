import {createFileRoute} from '@tanstack/react-router'
import {markdownPathToSlugs} from '@/lib/docs-paths'
import {getDocsMeta} from '@/lib/docs.functions'

export const Route = createFileRoute('/og/{$}.png')({
  server: {
    handlers: {
      GET: async ({params, request}) => {
        const slug = (params._splat ?? '').replace(/\.png$/, '')
        const slugs = markdownPathToSlugs(slug.split('/'))
        const page = await getDocsMeta({data: slugs})
        if (page === null) return new Response('Not found', {status: 404})

        const {renderOgImageResponse, OG_IMAGE_CACHE_HEADERS} = await import('@/lib/og-render.server')
        return renderOgImageResponse({title: page.title, description: page.description}, request.url, {
          headers: OG_IMAGE_CACHE_HEADERS,
        })
      },
    },
  },
})
