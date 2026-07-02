import type {z} from 'zod'

export type ApiError = Error & {path: string; status: number}
export function apiError(path: string, status: number): ApiError {
  return Object.assign(new Error(`${path} → ${status}`), {path, status})
}

type Args<T> = {} extends T ? [body?: T] : [body: T]

export function createTransport(opts: {apiBase: string; headers?: () => Record<string, string>}) {
  const base = opts.apiBase.replace(/\/+$/, '')
  const extra = opts.headers ?? (() => ({}))
  function route<Res extends z.ZodTypeAny>(spec: {
    method: 'GET' | 'DELETE'
    path: string
    response: Res
  }): () => Promise<z.infer<Res>>
  function route<Req extends z.ZodTypeAny, Res extends z.ZodTypeAny>(spec: {
    method: 'POST'
    path: string
    request: Req
    response: Res
  }): (...a: Args<z.infer<Req>>) => Promise<z.infer<Res>>
  function route(spec: {method: string; path: string; request?: z.ZodTypeAny; response: z.ZodTypeAny}) {
    return (body?: unknown) => {
      const headers: Record<string, string> = {...extra()}

      const payload = spec.request ? JSON.stringify(body ?? {}) : undefined
      if (payload) headers['content-type'] = 'application/json'
      return fetch(`${base}${spec.path}`, {method: spec.method, credentials: 'include', headers, body: payload})
        .then((r) => (r.ok ? r.json() : Promise.reject(apiError(spec.path, r.status))))
        .then((j) => spec.response.parse(j))
    }
  }
  return {
    route,
    url: (path: string) => `${base}${path}`,
    headers: extra,
    eventSource: (path: string) => new EventSource(`${base}${path}`, {withCredentials: true}),
  }
}
