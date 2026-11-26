import {z} from 'zod'

export const settingsSearchSchema = z.object({
  scope: z.enum(['project', 'global']).default('project').catch('project'),
})
