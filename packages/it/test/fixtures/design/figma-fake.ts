import {execFile} from 'node:child_process'
import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {createServer as createProxy, type IncomingMessage, type ServerResponse} from 'node:http'
import {createServer as createHttps} from 'node:https'
import {connect, type AddressInfo} from 'node:net'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'

export type FakeFigma = {env: Record<string, string>; asked: () => string[]; close: () => Promise<void>}

export async function fakeFigma(frames: Record<string, string>): Promise<FakeFigma> {
  const dir = await mkdtemp(join(tmpdir(), 'conciv-design-figma-'))
  const key = join(dir, 'figma-key.pem')
  const cert = join(dir, 'figma-cert.pem')
  await run('openssl', [...CERT_ARGS, '-keyout', key, '-out', cert])
  const asked: string[] = []
  const answer = (request: IncomingMessage, response: ServerResponse) => {
    const reply = replied({url: new URL(request.url ?? '/', FIGMA_ORIGIN), frames})
    asked.push(reply.kind)
    void Promise.resolve(reply.body).then(
      (body) => response.writeHead(reply.status ?? OK).end(body),
      (cause: unknown) => response.writeHead(FAILED).end(String(cause)),
    )
  }
  const figma = createHttps({key: await readFile(key), cert: await readFile(cert)}, (request, response) => {
    answer(request, response)
  })
  const proxy = createProxy()
  proxy.on('connect', (_request, socket, head) => {
    const tunnel = connect(port(figma), LOOPBACK, () => {
      socket.write(TUNNEL_OPEN)
      tunnel.write(head)
      tunnel.pipe(socket)
      socket.pipe(tunnel)
    })
    tunnel.on('error', () => socket.destroy())
    socket.on('error', () => tunnel.destroy())
  })
  await Promise.all([figma, proxy].map((server) => new Promise((done) => server.listen(0, LOOPBACK, () => done(null)))))
  return {
    env: {
      FIGMA_API_KEY: 'fixture-token',
      NODE_USE_ENV_PROXY: '1',
      HTTPS_PROXY: `http://${LOOPBACK}:${port(proxy)}`,
      NODE_EXTRA_CA_CERTS: cert,
    },
    asked: () => [...asked],
    close: async () => {
      await Promise.all([figma, proxy].map((server) => new Promise((done) => server.close(() => done(null)))))
      await rm(dir, {recursive: true, force: true})
    },
  }
}

const FIGMA_ORIGIN = 'https://api.figma.com'
const LOOPBACK = '127.0.0.1'
const FORBIDDEN = 403
const OK = 200
const FAILED = 500
const PNG = '.png'
const DOT = 'check-row.png'
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'
const TUNNEL_OPEN = 'HTTP/1.1 200 Connection Established\r\n\r\n'
const CERT_ARGS = [
  'req',
  '-x509',
  '-newkey',
  'rsa:2048',
  '-nodes',
  '-days',
  '1',
  '-subj',
  '/CN=api.figma.com',
  '-addext',
  'subjectAltName=DNS:api.figma.com',
]
const run = promisify(execFile)

function fixture(file: string): string {
  return fileURLToPath(new URL(file, import.meta.url))
}

function fixtureJson(file: string): Promise<string> {
  return readFile(fixture(file), 'utf8')
}

function port(server: {address: () => AddressInfo | string | null}): number {
  const address = server.address()
  return typeof address === 'object' && address !== null ? address.port : 0
}

type Reply = {kind: string; status?: number; body: string | Promise<string | Buffer>}

function replied(input: {url: URL; frames: Record<string, string>}): Reply {
  const {url, frames} = input
  const ids = url.searchParams.get('ids') ?? ''
  const [, , kind, , part] = url.pathname.split('/')
  if (part === 'nodes') return {kind: `nodes ${ids}`, body: fixtureJson(`${frames[ids]}.json`)}
  if (part === 'variables') return {kind: 'variables', status: FORBIDDEN, body: '{}'}
  if (part === 'images') return {kind: 'fills', body: JSON.stringify({meta: {images: {}}})}
  if (kind === 'images') return exported({url, ids, frames})
  return downloaded({file: url.pathname.split('/').at(-1) ?? '', frames})
}

function exported(input: {url: URL; ids: string; frames: Record<string, string>}): Reply {
  const {url, ids} = input
  const format = url.searchParams.get('format') ?? 'png'
  const links = Object.fromEntries(ids.split(',').map((id) => [id, `${FIGMA_ORIGIN}/files/${id}.${format}`]))
  return {kind: input.frames[ids] === undefined ? 'export' : `render ${ids}`, body: JSON.stringify({images: links})}
}

function downloaded(input: {file: string; frames: Record<string, string>}): Reply {
  const {file} = input
  const frame = input.frames[file.slice(0, -PNG.length)]
  if (frame !== undefined) return {kind: `picture ${file}`, body: readFile(fixture(`${frame}.png`))}
  return {kind: 'download', body: file.endsWith('.svg') ? SVG : readFile(fixture(DOT))}
}
