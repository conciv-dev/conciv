import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {Hono} from 'hono'
import {html} from 'hono/html'
import {z} from 'zod'

export const WIDGET_PAGE_PATH = '/widget'
const WIDGET_LOADER = 'conciv-widget.global.js'
const WIDGET_CHUNKS = 'widget'
const LoaderFileSchema = z.literal(WIDGET_LOADER)
const ChunkFileSchema = z.string().regex(/^[\w-]+(?:\.[\w-]+)*\.js$/)
const LauncherSchema = z.enum(['native', 'mascot']).optional().catch(undefined)

export function widgetDocument(requestUrl: string): string {
  const url = new URL(requestUrl)
  const launcher = LauncherSchema.parse(url.searchParams.get('launcher') ?? undefined)
  const settings = JSON.stringify(launcher === undefined ? {} : {launcher})
  return html`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <meta name="conciv-api-base" content="${url.origin}" />
        <meta name="conciv-widget" content="${settings}" />
        <title>conciv</title>
        <style>
          :root {
            color-scheme: dark;
          }
          html,
          body {
            margin: 0;
            padding: 0;
            height: 100%;
            background: transparent !important;
            background-color: transparent !important;
          }
          body {
            font-family: -apple-system, system-ui, sans-serif;
            -webkit-text-size-adjust: 100%;
          }
        </style>
      </head>
      <body>
        <script src="${WIDGET_PAGE_PATH.slice(1)}/${WIDGET_LOADER}"></script>
      </body>
    </html>`.toString()
}

export function makeWidgetPageApp(dir: string): Hono {
  return new Hono()
    .get('/', (c) => c.html(widgetDocument(c.req.url)))
    .get(`/${WIDGET_CHUNKS}/:file`, async (c) => {
      const parsed = ChunkFileSchema.safeParse(c.req.param('file'))
      if (!parsed.success) return c.text('not found', 404)
      return serveFile(join(dir, WIDGET_CHUNKS, parsed.data))
    })
    .get('/:file', async (c) => {
      const parsed = LoaderFileSchema.safeParse(c.req.param('file'))
      if (!parsed.success) return c.text('not found', 404)
      return serveFile(join(dir, parsed.data))
    })
}

async function serveFile(path: string): Promise<Response> {
  const body = await readFile(path).catch(() => null)
  if (!body) return new Response('not found', {status: 404})
  return new Response(new Uint8Array(body), {headers: {'content-type': 'text/javascript; charset=utf-8'}})
}
