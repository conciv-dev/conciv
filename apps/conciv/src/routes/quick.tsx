import {createFileRoute} from '@tanstack/solid-router'
import {QuickSearchSchema} from '../lib/quick-search.js'

export const Route = createFileRoute('/quick')({
  validateSearch: (search) => QuickSearchSchema.parse(search),
  component: QuickLayer,
})

function QuickLayer() {
  return null
}
