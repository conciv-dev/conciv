import {createFileRoute} from '@tanstack/react-router'
import {z} from 'zod'

export const Route = createFileRoute('/products')({
  validateSearch: z.object({
    page: z.number().default(1),
    sort: z.string().default('newest').catch('newest'),
  }),
})
