import {z} from 'zod'

export type RegistryState = 'missing' | 'trusted' | 'untrusted'

const registryDocumentSchema = z.object({
  'dist-tags': z.object({latest: z.string().optional()}).optional(),
  versions: z
    .record(z.string(), z.object({_npmUser: z.object({trustedPublisher: z.unknown().optional()}).optional()}))
    .optional(),
})

type RegistryDocument = z.infer<typeof registryDocumentSchema>

export async function registryState(name: string): Promise<RegistryState> {
  const response = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}`)
  if (response.status === 404) return 'missing'
  if (!response.ok) {
    throw new Error(`registry lookup for ${name} failed with ${response.status}`)
  }
  const document = registryDocumentSchema.parse(await response.json())
  return latestViaTrustedPublisher(document) ? 'trusted' : 'untrusted'
}

function latestViaTrustedPublisher(document: RegistryDocument): boolean {
  const latest = document['dist-tags']?.latest
  if (!latest) return false
  return document.versions?.[latest]?._npmUser?.trustedPublisher !== undefined
}
