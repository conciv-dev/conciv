import {execFileSync} from 'node:child_process'
import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, relative} from 'node:path'
import {gzipSync} from 'node:zlib'

export type PackageSize = {name: string; raw: number; gzip: number; files: number}

const PACKAGE_GROUPS = ['packages', 'packages/extensions']
const BUNDLED_EXTENSIONS = ['.js', '.mjs', '.cjs', '.css']
const WIDGET_BUNDLE = 'packages/embed/dist/conciv-widget.global.js'

const SITE_SERVER_DIST = 'apps/site/dist/server'
export const WORKER_NAME = 'conciv.dev worker (apps/site)'
export const WORKER_LIMIT_KIB = 3 * 1024

export type WorkerReport = {size: PackageSize; chunks: {file: string; gzip: number}[]}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function publishedPackages(root: string): {name: string; dir: string}[] {
  return PACKAGE_GROUPS.flatMap((group) =>
    readdirSync(join(root, group), {withFileTypes: true})
      .filter((entry) => entry.isDirectory() && existsSync(join(root, group, entry.name, 'package.json')))
      .flatMap((entry) => {
        const dir = join(root, group, entry.name)
        const manifest: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
        if (!isRecord(manifest) || manifest.private === true || typeof manifest.name !== 'string') return []
        return [{name: manifest.name, dir}]
      }),
  )
}

function distFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    if (entry.isDirectory()) return distFiles(join(dir, entry.name))
    if (BUNDLED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) return [join(dir, entry.name)]
    return []
  })
}

function sizeOfFiles(name: string, files: string[]): PackageSize {
  const contents = files.map((file) => readFileSync(file))
  return {
    name,
    raw: contents.reduce((total, content) => total + content.byteLength, 0),
    gzip: contents.reduce((total, content) => total + gzipSync(content).byteLength, 0),
    files: files.length,
  }
}

export function measureSizes(root: string): PackageSize[] {
  const packages = publishedPackages(root)
    .map(({name, dir}) => sizeOfFiles(name, distFiles(join(dir, 'dist'))))
    .filter((size) => size.files > 0)
  const widgetPath = join(root, WIDGET_BUNDLE)
  const widget = existsSync(widgetPath)
    ? [sizeOfFiles(`widget bundle (${relative(root, widgetPath)})`, [widgetPath])]
    : []
  return [...widget, ...packages.toSorted((a, b) => a.name.localeCompare(b.name))]
}

export function parseSizes(raw: string): PackageSize[] {
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isRecord).flatMap((entry) => {
    if (typeof entry.name !== 'string') return []
    return [
      {
        name: entry.name,
        raw: typeof entry.raw === 'number' ? entry.raw : 0,
        gzip: typeof entry.gzip === 'number' ? entry.gzip : 0,
        files: typeof entry.files === 'number' ? entry.files : 0,
      },
    ]
  })
}

const KIB_TOTALS = /Total Upload:\s*(\d+(?:\.\d+)?)\s*KiB\s*\/\s*gzip:\s*(\d+(?:\.\d+)?)\s*KiB/

export function parseWorkerSize(wranglerOutput: string): {raw: number; gzip: number} {
  const match = wranglerOutput.match(KIB_TOTALS)
  const raw = Number(match?.[1])
  const gzip = Number(match?.[2])
  if (!Number.isFinite(raw) || !Number.isFinite(gzip)) {
    throw new Error('could not read the worker size from wrangler output')
  }
  return {raw: Math.round(raw * 1024), gzip: Math.round(gzip * 1024)}
}

export function measureWorker(root: string): WorkerReport | null {
  if (!existsSync(join(root, SITE_SERVER_DIST))) return null
  const outdir = mkdtempSync(join(tmpdir(), 'conciv-worker-size-'))
  try {
    const output = execFileSync(
      'pnpm',
      ['--filter', 'site', 'exec', 'wrangler', 'deploy', '--dry-run', '--outdir', outdir],
      {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']},
    )
    const {raw, gzip} = parseWorkerSize(output)
    const chunks = distFiles(outdir)
      .map((file) => ({file: relative(outdir, file), gzip: gzipSync(readFileSync(file)).byteLength}))
      .toSorted((a, b) => b.gzip - a.gzip)
    return {size: {name: WORKER_NAME, raw, gzip, files: chunks.length}, chunks}
  } finally {
    rmSync(outdir, {recursive: true, force: true})
  }
}

export function formatWorkerOverBudget(report: WorkerReport, limitKib: number): string {
  const gzipKib = report.size.gzip / 1024
  const over = (gzipKib - limitKib).toFixed(1)
  const lines = report.chunks
    .slice(0, 10)
    .map((chunk) => `  ${(chunk.gzip / 1024).toFixed(1).padStart(8)} KiB  ${chunk.file}`)
  return [
    `${WORKER_NAME} is ${gzipKib.toFixed(1)} KiB gzip, over the ${limitKib} KiB budget by ${over} KiB. The site will not deploy on this Cloudflare plan.`,
    'Largest worker chunks (gzip):',
    ...lines,
    'Fix: keep client-only libraries out of the server bundle. See trimServerBundle in apps/site/vite.config.ts.',
  ].join('\n')
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} kB`
}

function delta(current: number, base: number | undefined): string {
  if (base === undefined || base === 0) return base === undefined ? 'new' : ''
  const diff = current - base
  if (diff === 0) return '='
  const sign = diff > 0 ? '+' : '−'
  const pct = ((Math.abs(diff) / base) * 100).toFixed(1)
  return `${sign}${kb(Math.abs(diff))} (${sign}${pct}%)`
}

export function renderSizes(current: PackageSize[], baseline: PackageSize[] | null): string {
  const baseByName = new Map((baseline ?? []).map((size) => [size.name, size]))
  const rows = current.map((size) => {
    const base = baseByName.get(size.name)
    const change = baseline === null ? '' : delta(size.gzip, base?.gzip)
    return `| ${size.name} | ${kb(size.gzip)} | ${change} | ${kb(size.raw)} | ${size.files} |`
  })
  const totalGzip = current.reduce((total, size) => total + size.gzip, 0)
  const baseTotal = baseline === null ? undefined : baseline.reduce((total, size) => total + size.gzip, 0) || undefined
  const totalChange = baseline === null ? '' : ` (${delta(totalGzip, baseTotal)} vs main)`
  const lines = [
    '## Bundle size',
    '',
    `**${kb(totalGzip)} gzip total**${totalChange}`,
    '',
    '| Package | Gzip | Δ vs main | Raw | Files |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
  ]
  return `${lines.join('\n')}\n`
}
