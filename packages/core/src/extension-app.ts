import {H3, withBase} from 'h3'

export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function makeExtensionApp(parent: H3, name: string, originAllowed: (origin: string | null) => boolean): H3 {
  const sub = new H3()
  sub.use((event, next) =>
    originAllowed(event.req.headers.get('origin')) ? next() : new Response('forbidden origin', {status: 403}),
  )
  const prefix = `/api/ext/${slug(name)}`
  parent.use(`${prefix}/**`, withBase(prefix, sub.handler))
  return sub
}
