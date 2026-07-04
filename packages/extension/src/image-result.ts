import type {ContentPart} from '@tanstack/ai'

function stringifyDetail(detail: unknown): string {
  try {
    return JSON.stringify(detail) ?? 'null'
  } catch (error) {
    return JSON.stringify({error: 'image detail could not be serialized', reason: String(error)})
  }
}

export function imageResult(mimeType: string, dataBase64: string, detail?: unknown): ContentPart[] {
  const image: ContentPart = {type: 'image', source: {type: 'data', value: dataBase64, mimeType}}
  if (detail === undefined) return [image]
  return [image, {type: 'text', content: stringifyDetail(detail)}]
}
