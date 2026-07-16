import {createFileRoute} from '@tanstack/react-router'
import {LandingPage} from '@/components/landing/landing-page'

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): {try?: 1} => (search.try === 1 ? {try: 1} : {}),
  component: LandingPage,
})
