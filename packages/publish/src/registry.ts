import {z} from 'zod'

export type RegistryState = 'missing' | 'trusted' | 'untrusted'

const registryDocumentSchema = z.object({
  'dist-tags': z.object({latest: z.string().optional()}).optional(),
  versions: z
    .record(z.string(), z.object({_npmUser: z.object({trustedPublisher: z.unknown().optional()}).optional()}))
    .optional(),
})

type RegistryDocument = z.infer<typeof registryDocumentSchema>

export type RegistryRecord = {state: RegistryState; versions: string[]}

export function recordFromDocument(value: unknown): RegistryRecord {
  const document = registryDocumentSchema.parse(value)
  return {
    state: latestViaTrustedPublisher(document) ? 'trusted' : 'untrusted',
    versions: Object.keys(document.versions ?? {}),
  }
}

export async function registryRecord(name: string): Promise<RegistryRecord> {
  const response = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}`)
  if (response.status === 404) return {state: 'missing', versions: []}
  if (!response.ok) {
    throw new Error(`registry lookup for ${name} failed with ${response.status}`)
  }
  return recordFromDocument(await response.json())
}

function latestViaTrustedPublisher(document: RegistryDocument): boolean {
  const latest = document['dist-tags']?.latest
  if (!latest) return false
  return document.versions?.[latest]?._npmUser?.trustedPublisher !== undefined
}
