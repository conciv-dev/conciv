import {docsPageUrl, SITE} from './site-urls'
import {gitConfig} from './shared'

export const ORGANIZATION_ID = `${SITE}/#organization`
export const WEBSITE_ID = `${SITE}/#website`

function buildOrganizationJsonLd() {
  return {
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: 'conciv',
    url: SITE,
    logo: `${SITE}/favicon.svg`,
    sameAs: [`https://github.com/${gitConfig.user}/${gitConfig.repo}`],
  }
}

function buildWebsiteJsonLd() {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: 'conciv',
    url: `${SITE}/`,
    publisher: {'@id': ORGANIZATION_ID},
  }
}

export function buildRootJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [buildWebsiteJsonLd(), buildOrganizationJsonLd()],
  }
}

export type BreadcrumbItem = {
  name: string
  url: string
}

function buildBreadcrumbListJsonLd(items: BreadcrumbItem[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

function titleCaseSlug(slug: string) {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function buildDocsBreadcrumb(splat: string | undefined, pageTitle: string): BreadcrumbItem[] {
  const slugs = splat && splat.length > 0 ? splat.split('/') : []
  const items: BreadcrumbItem[] = [{name: 'Docs', url: docsPageUrl(undefined)}]

  slugs.forEach((slug, index) => {
    const isLast = index === slugs.length - 1
    const pathSoFar = slugs.slice(0, index + 1).join('/')
    items.push({name: isLast ? pageTitle : titleCaseSlug(slug), url: docsPageUrl(pathSoFar)})
  })

  return items
}

type TechArticleInput = {
  title: string
  description: string
  url: string
  image: string
  breadcrumb: BreadcrumbItem[]
}

export function buildDocsPageJsonLd(input: TechArticleInput) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        headline: input.title,
        description: input.description,
        url: input.url,
        image: input.image,
        isPartOf: {'@id': WEBSITE_ID},
        publisher: {'@id': ORGANIZATION_ID},
      },
      buildBreadcrumbListJsonLd(input.breadcrumb),
    ],
  }
}
