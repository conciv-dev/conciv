import {createRootRoute, HeadContent, Outlet, Scripts} from '@tanstack/react-router'
import * as React from 'react'
import appCss from '@/styles/app.css?url'
import {RootProvider} from 'fumadocs-ui/provider/tanstack'

const SITE = 'https://mandarax.dev'
const TITLE = 'mandarax — an AI dev agent inside your running app'
const DESCRIPTION =
  'mandarax is a dev-only AI agent embedded in your running app. Grab any element, chat, and let it drive the page and run your tests — without leaving what you are building.'
const OG_IMAGE = `${SITE}/og.png`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {charSet: 'utf-8'},
      {name: 'viewport', content: 'width=device-width, initial-scale=1'},
      {title: TITLE},
      {name: 'description', content: DESCRIPTION},
      {name: 'theme-color', content: '#e0432a'},
      // Open Graph
      {property: 'og:type', content: 'website'},
      {property: 'og:site_name', content: 'mandarax'},
      {property: 'og:title', content: TITLE},
      {property: 'og:description', content: DESCRIPTION},
      {property: 'og:url', content: SITE},
      {property: 'og:image', content: OG_IMAGE},
      {property: 'og:image:width', content: '1200'},
      {property: 'og:image:height', content: '630'},
      {property: 'og:locale', content: 'en_US'},
      // Twitter
      {name: 'twitter:card', content: 'summary_large_image'},
      {name: 'twitter:title', content: TITLE},
      {name: 'twitter:description', content: DESCRIPTION},
      {name: 'twitter:image', content: OG_IMAGE},
    ],
    links: [
      {rel: 'stylesheet', href: appCss},
      {rel: 'canonical', href: `${SITE}/`},
      {rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml'},
      {rel: 'apple-touch-icon', href: '/favicon.svg'},
    ],
  }),
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
        <Scripts />
      </body>
    </html>
  )
}
