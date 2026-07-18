import {existsSync, readFileSync, readdirSync} from 'node:fs'
import {join, relative} from 'node:path'
import {gzipSync} from 'node:zlib'

export type PackageSize = {name: string; raw: number; gzip: number; files: number}

const PACKAGE_GROUPS = ['packages', 'packages/extensions']
const BUNDLED_EXTENSIONS = ['.js', '.mjs', '.cjs', '.css']
const WIDGET_BUNDLE = 'packages/embed/dist/conciv-widget.global.js'

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
