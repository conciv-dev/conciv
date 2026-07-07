import {Hono} from 'hono'

export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function makeExtensionApp(originAllowed: (origin: string | null) => boolean): Hono {
  const sub = new Hono()
  sub.use(async (c, next) => {
    if (!originAllowed(c.req.header('origin') ?? null)) return c.text('forbidden origin', 403)
    await next()
  })
  return sub
}
