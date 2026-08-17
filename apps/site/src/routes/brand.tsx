import {createFileRoute} from '@tanstack/react-router'
import {BrandPage} from '@/components/brand/brand-page'
import {seo} from '@/lib/seo'
import {brandPageDescription, brandPageTitle, SITE} from '@/lib/site-urls'

export const Route = createFileRoute('/brand')({
  component: BrandPage,
  head: () => ({
    meta: seo({
      title: brandPageTitle,
      description: brandPageDescription,
      image: `${SITE}/brand/social/og-default-1200x630.png`,
      twitterImage: `${SITE}/brand/social/twitter-1200x600.png`,
    }),
  }),
})
