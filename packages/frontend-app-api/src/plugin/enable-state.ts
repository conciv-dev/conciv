import {log} from 'evlog'
import {z} from 'zod'
import type {SettingsSnapshot} from '@conciv/protocol'
import type {EnableState} from './installed'

const EnableRowSchema = z.object({id: z.string().min(1), enabled: z.boolean()})

export function readEnableState(snapshot: SettingsSnapshot): readonly EnableState[] {
  return Object.entries(snapshot.value).flatMap(([id, enabled]) => {
    const row = EnableRowSchema.safeParse({id, enabled})
    if (row.success) return [row.data]
    log.error({action: 'plugins', message: 'dropped the stored enable state', plugin: id, error: row.error})
    return []
  })
}
