import {createRootRoute, HeadContent, Outlet, retainSearchParams, Scripts} from '@tanstack/react-router'
import * as React from 'react'
import appCss from '@/styles/app.css?url'
import {RootProvider} from 'fumadocs-ui/provider/tanstack'
import {LiveWidgetMount} from '@/components/live-widget-mount'
import {rootSearchSchema} from '@/lib/search-schemas'
import {canonicalHeadTags, DEFAULT_DESCRIPTION, DEFAULT_TITLE, SITE} from '@/lib/site-urls'
import {seo} from '@/lib/seo'
import {buildRootJsonLd} from '@/lib/structured-data'

const OG_IMAGE = `${SITE}/og.png`

export const Route = createRootRoute({
  validateSearch: rootSearchSchema,
  search: {middlewares: [retainSearchParams(['widget'])]},
  beforeLoad: ({matches}) => ({
    widgetHomeDefault: matches.some((match) => match.routeId === '/'),
  }),
  head: ({matches}) => {
    const canonical = canonicalHeadTags(matches)

    return {
      meta: [
        {charSet: 'utf-8'},
        {name: 'viewport', content: 'width=device-width, initial-scale=1'},
        {name: 'theme-color', content: '#e0432a'},
        ...seo({title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION, image: OG_IMAGE}),
        {property: 'og:image:width', content: '1200'},
        {property: 'og:image:height', content: '630'},
        {property: 'og:locale', content: 'en_US'},
        ...canonical.meta,
      ],
      links: [
        {rel: 'stylesheet', href: appCss},
        {rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml'},
        {rel: 'apple-touch-icon', href: '/favicon.svg'},
        ...canonical.links,
      ],
      scripts: [{type: 'application/ld+json', children: JSON.stringify(buildRootJsonLd())}],
    }
  },
  component: RootComponent,
})

function RootComponent() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="flex flex-col min-h-screen">
        <RootProvider>
          <Outlet />
        </RootProvider>
        <LiveWidgetMount />
        <Scripts />
      </body>
    </html>
  )
}
