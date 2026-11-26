import {z} from 'zod'
import type {SettingsSnapshot} from '@conciv/protocol'
import type {EnableState} from './installed'

const EnableRowSchema = z.object({id: z.string().min(1), enabled: z.boolean()})

export function readEnableState(snapshot: SettingsSnapshot): readonly EnableState[] {
  return Object.entries(snapshot.value).flatMap(([id, enabled]) => {
    const row = EnableRowSchema.safeParse({id, enabled})
    if (row.success) return [row.data]
    console.error(`[plugins] dropped the stored enable state of ${id}`, row.error)
    return []
  })
}
