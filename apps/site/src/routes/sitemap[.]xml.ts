import {createFileRoute} from '@tanstack/react-router'
import {source} from '@/lib/source'
import {brandPageUrl, buildSitemapXml, landingPageUrl, SITE} from '@/lib/site-urls'

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET() {
        const docsUrls = source.getPages().map((page) => `${SITE}${page.url}`)
        const xml = buildSitemapXml([landingPageUrl(), brandPageUrl(), ...docsUrls])

        return new Response(xml, {
          headers: {'Content-Type': 'application/xml'},
        })
      },
    },
  },
})
