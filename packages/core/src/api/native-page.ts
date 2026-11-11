import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {Hono} from 'hono'
import {z} from 'zod'

export const NATIVE_PAGE_PATH = '/native'
const NATIVE_BUNDLE = 'conciv-widget-native.global.js'
const WIDGET_CHUNKS = 'widget'
const NativeFileSchema = z.literal(NATIVE_BUNDLE)
const ChunkFileSchema = z.string().regex(/^[\w-]+(?:\.[\w-]+)*\.js$/)

export function hostDocument(): string {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">',
    '<title>conciv</title>',
    '<style>',
    ':root{color-scheme:dark}',
    'html,body{margin:0;padding:0;height:100%;background:transparent !important;background-color:transparent !important}',
    'body{font-family:-apple-system,system-ui,sans-serif;-webkit-text-size-adjust:100%}',
    '</style>',
    '</head>',
    '<body>',
    '<div data-conciv-native-root></div>',
    `<script src="native/${NATIVE_BUNDLE}"></script>`,
    '</body>',
    '</html>',
  ].join('')
}

export function makeNativePageApp(dir: string): Hono {
  return new Hono()
    .get('/', (c) => c.html(hostDocument()))
    .get(`/${WIDGET_CHUNKS}/:file`, async (c) => {
      const parsed = ChunkFileSchema.safeParse(c.req.param('file'))
      if (!parsed.success) return c.text('not found', 404)
      return serveFile(join(dir, WIDGET_CHUNKS, parsed.data))
    })
    .get('/:file', async (c) => {
      const parsed = NativeFileSchema.safeParse(c.req.param('file'))
      if (!parsed.success) return c.text('not found', 404)
      return serveFile(join(dir, parsed.data))
    })
}

async function serveFile(path: string): Promise<Response> {
  const body = await readFile(path).catch(() => null)
  if (!body) return new Response('not found', {status: 404})
  return new Response(new Uint8Array(body), {headers: {'content-type': 'text/javascript; charset=utf-8'}})
}
