import {createFileRoute} from '@tanstack/react-router'
import {z} from 'zod'

const pageSearchSchema = z.object({page: z.number().optional()})

export const Route = createFileRoute('/pages')({
  validateSearch: pageSearchSchema,
})
