import {createRootRoute, HeadContent, Outlet, retainSearchParams, Scripts} from '@tanstack/react-router'
import * as React from 'react'
import appCss from '@/styles/app.css?url'
import {RootProvider} from 'fumadocs-ui/provider/tanstack'
import {LiveWidgetMount} from '@/components/live-widget-mount'
import {rootSearchSchema} from '@/lib/search-schemas'
import {APPLE_TOUCH_ICON_URL, FAVICON_SVG_URL, OG_DEFAULT_URL, TWITTER_CARD_URL} from '@/lib/brand-assets'
import {canonicalHeadTags, DEFAULT_DESCRIPTION, DEFAULT_TITLE, SITE} from '@/lib/site-urls'
import {seo} from '@/lib/seo'
import {buildRootJsonLd} from '@/lib/structured-data'

const OG_IMAGE = `${SITE}${OG_DEFAULT_URL}`
const TWITTER_IMAGE = `${SITE}${TWITTER_CARD_URL}`

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
        {name: 'theme-color', content: '#D7263D'},
        ...seo({
          title: DEFAULT_TITLE,
          description: DEFAULT_DESCRIPTION,
          image: OG_IMAGE,
          twitterImage: TWITTER_IMAGE,
        }),
        {property: 'og:image:width', content: '1200'},
        {property: 'og:image:height', content: '630'},
        {property: 'og:locale', content: 'en_US'},
        ...canonical.meta,
      ],
      links: [
        {rel: 'stylesheet', href: appCss},
        {rel: 'icon', href: '/favicon.ico', sizes: '48x48'},
        {rel: 'icon', href: FAVICON_SVG_URL, type: 'image/svg+xml'},
        {rel: 'icon', href: '/favicon-16.png', type: 'image/png', sizes: '16x16'},
        {rel: 'icon', href: '/favicon-32.png', type: 'image/png', sizes: '32x32'},
        {rel: 'apple-touch-icon', href: APPLE_TOUCH_ICON_URL, sizes: '180x180'},
        {rel: 'manifest', href: '/site.webmanifest'},
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
