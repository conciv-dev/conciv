import {createFileRoute} from '@tanstack/react-router'
import {getDocsUrls} from '@/lib/docs.functions'
import {brandPageUrl, buildSitemapXml, landingPageUrl, SITE} from '@/lib/site-urls'

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      async GET() {
        const docsUrls = (await getDocsUrls()).map((url) => `${SITE}${url}`)
        const xml = buildSitemapXml([landingPageUrl(), brandPageUrl(), ...docsUrls])

        return new Response(xml, {
          headers: {'Content-Type': 'application/xml'},
        })
      },
    },
  },
})
