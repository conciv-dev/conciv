export const SITE = 'https://conciv.dev'

export const DEFAULT_TITLE = 'conciv: Conceive it. Claude Code, living inside your running app'
export const DEFAULT_DESCRIPTION =
  'conciv is a dev-only AI agent embedded in your running app. Grab any element, chat, and let it drive the page and run your tests, without leaving what you are building.'

export const brandPageTitle = 'conciv brand assets: logos, favicons, and social tiles'
export const brandPageDescription =
  'Download the conciv logo in every layout and tone, plus favicons, app icons, and social images, with the usage rules that keep the mark recognisable.'

export function landingPageUrl() {
  return `${SITE}/`
}

export function brandPageUrl() {
  return `${SITE}/brand`
}

function docsPagePath(splat: string | undefined) {
  return splat && splat.length > 0 ? `/docs/${splat}` : '/docs'
}

export function docsPageUrl(splat: string | undefined) {
  return `${SITE}${docsPagePath(splat)}`
}

function docsOgImageSlug(splat: string | undefined) {
  return splat && splat.length > 0 ? splat : 'index'
}

export function docsOgImageUrl(splat: string | undefined) {
  return `${SITE}/og/${docsOgImageSlug(splat)}.png`
}

function canonicalPathFromPathname(pathname: string) {
  if (!pathname || pathname === '/') return '/'
  return pathname.replace(/\/$/, '')
}

export function canonicalUrlFromPathname(pathname: string) {
  return `${SITE}${canonicalPathFromPathname(pathname)}`
}

type PathnameMatch = {pathname: string}

export function canonicalHeadTags(matches: ReadonlyArray<PathnameMatch>) {
  const lastMatch = matches[matches.length - 1]
  const url = canonicalUrlFromPathname(lastMatch?.pathname ?? '/')

  return {
    links: [{rel: 'canonical' as const, href: url}],
    meta: [
      {property: 'og:url', content: url},
      {name: 'twitter:url', content: url},
    ],
  }
}

export function buildSitemapXml(urls: string[]) {
  const entries = urls.map((url) => `  <url><loc>${url}</loc></url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`
}
