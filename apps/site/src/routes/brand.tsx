import {createFileRoute} from '@tanstack/react-router'
import {BrandPage} from '@/components/brand/brand-page'
import {seo} from '@/lib/seo'
import {brandPageDescription, brandPageTitle, SITE} from '@/lib/site-urls'
import {OG_DEFAULT_URL, TWITTER_CARD_URL} from '@/lib/brand-assets'

export const Route = createFileRoute('/brand')({
  component: BrandPage,
  head: () => ({
    meta: seo({
      title: brandPageTitle,
      description: brandPageDescription,
      image: `${SITE}${OG_DEFAULT_URL}`,
      twitterImage: `${SITE}${TWITTER_CARD_URL}`,
    }),
  }),
})
