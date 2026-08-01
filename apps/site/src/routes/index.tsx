import {createFileRoute} from '@tanstack/react-router'
import {LandingPage} from '@/components/landing/landing-page'
import {indexSearchSchema} from '@/lib/search-schemas'

export const Route = createFileRoute('/')({
  validateSearch: indexSearchSchema,
  component: LandingPage,
})
