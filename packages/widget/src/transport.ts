// The one place the widget touches the network — typed request/response over fetch (route) plus SSE
// helpers (eventSource/url) for ALL /api/* calls. defineClient layers the session header on top;
// non-session callers (page-bus, test-card, model probe) use a header-less transport.
import type {z} from 'zod'

// A non-2xx response. A factory (not a class) so we keep to functions while still throwing a real Error.
export type ApiError = Error & {path: string; status: number}
export function apiError(path: string, status: number): ApiError {
  return Object.assign(new Error(`${path} → ${status}`), {path, status})
}

// Omit the body param when {} satisfies the request type (all-optional schema), else require it.
type Args<T> = {} extends T ? [body?: T] : [body: T]

export function createTransport(opts: {apiBase: string; headers?: () => Record<string, string>}) {
  const base = opts.apiBase.replace(/\/+$/, '')
  const extra = opts.headers ?? (() => ({}))
  function route<Res extends z.ZodTypeAny>(spec: {method: 'GET' | 'DELETE'; path: string; response: Res}): () => Promise<z.infer<Res>>
  function route<Req extends z.ZodTypeAny, Res extends z.ZodTypeAny>(spec: {method: 'POST'; path: string; request: Req; response: Res}): (...a: Args<z.infer<Req>>) => Promise<z.infer<Res>>
  function route(spec: {method: string; path: string; request?: z.ZodTypeAny; response: z.ZodTypeAny}) {
    return (body?: unknown) => {
      const headers: Record<string, string> = {...extra()}
      // A POST route always sends a JSON body — default to {} when the (all-optional) body is omitted,
      // so the server's readValidatedBody gets an object, not a missing body.
      const payload = spec.request ? JSON.stringify(body ?? {}) : undefined
      if (payload) headers['content-type'] = 'application/json'
      return fetch(`${base}${spec.path}`, {method: spec.method, credentials: 'include', headers, body: payload})
        .then((r) => (r.ok ? r.json() : Promise.reject(apiError(spec.path, r.status))))
        .then((j) => spec.response.parse(j))
    }
  }
  return {
    route,
    url: (path: string) => `${base}${path}`, // for the AG-UI chat stream transport
    headers: extra, // the header function the stream transport consumes
    eventSource: (path: string) => new EventSource(`${base}${path}`, {withCredentials: true}),
  }
}
