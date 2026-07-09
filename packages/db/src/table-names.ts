import {z} from 'zod'
import {stateError} from './errors.js'

export const ExtensionTableSpecSchema = z.object({
  extension: z.string().min(1),
  name: z.string().min(1),
  columns: z.string().min(1),
})

export type ExtensionTableSpec = z.infer<typeof ExtensionTableSpecSchema>

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function assertIdentifier(kind: string, raw: string): string {
  const slugged = slug(raw)
  if (!/^[a-z][a-z0-9_]*$/.test(slugged)) {
    throw stateError(
      'invalid-table',
      `extension table ${kind} ${JSON.stringify(raw)} slugs to ${JSON.stringify(slugged)}`,
      {
        kind,
        raw,
        slugged,
      },
    )
  }
  return slugged
}

export function extensionTableName(spec: Pick<ExtensionTableSpec, 'extension' | 'name'>): string {
  return `ext_${assertIdentifier('extension', spec.extension)}_${assertIdentifier('name', spec.name)}`
}
