import {z} from 'zod'

export type RegistryState = 'missing' | 'trusted' | 'untrusted'

const registryDocumentSchema = z.object({
  'dist-tags': z.object({latest: z.string().optional()}).optional(),
  versions: z
    .record(z.string(), z.object({_npmUser: z.object({trustedPublisher: z.unknown().optional()}).optional()}))
    .optional(),
})

type RegistryDocument = z.infer<typeof registryDocumentSchema>

export function stateFromDocument(value: unknown): RegistryState {
  const document = registryDocumentSchema.parse(value)
  return latestViaTrustedPublisher(document) ? 'trusted' : 'untrusted'
}

export async function registryState(name: string): Promise<RegistryState> {
  const response = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}`)
  if (response.status === 404) return 'missing'
  if (!response.ok) {
    throw new Error(`registry lookup for ${name} failed with ${response.status}`)
  }
  return stateFromDocument(await response.json())
}

function latestViaTrustedPublisher(document: RegistryDocument): boolean {
  const latest = document['dist-tags']?.latest
  if (!latest) return false
  return document.versions?.[latest]?._npmUser?.trustedPublisher !== undefined
}
