import type {ZodType} from 'zod'

export type JsonResponse<T> = {status: number; data: T}

export async function getJson<T>(url: string, schema: ZodType<T>): Promise<JsonResponse<T>> {
  const res = await fetch(url)
  const data = schema.parse(await res.json())
  return {status: res.status, data}
}

export async function postJson<T>(url: string, body: unknown, schema: ZodType<T>): Promise<JsonResponse<T>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(body),
  })
  const data = schema.parse(await res.json())
  return {status: res.status, data}
}
