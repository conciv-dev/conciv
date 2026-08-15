import {DEFAULT_DESCRIPTION, DEFAULT_TITLE, docsOgImageUrl, docsPageUrl} from './site-urls'
import {seo} from './seo'
import {buildDocsBreadcrumb, buildDocsPageJsonLd} from './structured-data'

type DocsHeadInput = {
  splat: string | undefined
  page?: {
    title: string
    description?: string
  }
}

export function buildDocsHead({splat, page}: DocsHeadInput) {
  const pageTitle = page?.title ?? DEFAULT_TITLE
  const description = page?.description ?? DEFAULT_DESCRIPTION
  const title = page ? `${pageTitle} — conciv` : DEFAULT_TITLE
  const ogImage = docsOgImageUrl(splat)
  const url = docsPageUrl(splat)
  const breadcrumb = buildDocsBreadcrumb(splat, pageTitle)

  return {
    meta: seo({title, description, image: ogImage}),
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify(buildDocsPageJsonLd({title: pageTitle, description, url, image: ogImage, breadcrumb})),
      },
    ],
  }
}
