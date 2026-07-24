import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {Hono} from 'hono'
import {z} from 'zod'

const NATIVE_BUNDLE = 'conciv-widget-native.global.js'
const NativeFileSchema = z.enum([NATIVE_BUNDLE, `${NATIVE_BUNDLE}.map`])

function hostDocument(): string {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
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
    .get('/:file', async (c) => {
      const parsed = NativeFileSchema.safeParse(c.req.param('file'))
      if (!parsed.success) return c.text('not found', 404)
      const body = await readFile(join(dir, parsed.data)).catch(() => null)
      if (!body) return c.text('not found', 404)
      const type = parsed.data.endsWith('.map') ? 'application/json' : 'text/javascript; charset=utf-8'
      return new Response(new Uint8Array(body), {headers: {'content-type': type}})
    })
}
