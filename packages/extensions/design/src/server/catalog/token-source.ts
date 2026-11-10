import {dirname, join, resolve} from 'node:path'
import {uniq} from 'es-toolkit'
import postcss, {type ChildNode, type Rule} from 'postcss'
import {createStorage, type Storage} from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import {z} from 'zod'
import type {Catalog, Token, TokenSource} from '../../shared/catalog-defs.js'

export function createCssTokenSource(input: {files: string[]; catalog: Catalog}): TokenSource {
  const disk = createStorage({driver: fsDriver({base: DISK_ROOT, readOnly: true})})
  return {
    name: 'css',
    async read({cwd}) {
      const files =
        input.files.length > 0
          ? input.files.map((file) => resolve(cwd, file))
          : await kitStylesheets({catalog: input.catalog, disk, cwd})
      const sheets = await Promise.all(files.map(async (file) => ({file, css: await text({disk, file})})))
      return sheets.flatMap(({file, css}) => (css === null ? [] : tokensIn({file, nodes: postcss.parse(css).nodes})))
    },
  }
}

const DISK_ROOT = '/'
const PACKAGE_JSON = 'package.json'
const STYLESHEET = '.css'
const KIT = 'kit'
const ROOT_SELECTORS = new Set([':root', ':host'])
const CUSTOM_PROPERTY = '--'
const LIGHT_DARK = 'light-dark('
const CLOSE = ')'

const PackageSchema = z.object({name: z.string().nullable().catch(null), exports: z.unknown()})

async function kitStylesheets(input: {catalog: Catalog; disk: Storage; cwd: string}): Promise<string[]> {
  const {catalog, disk, cwd} = input
  const kits = (await catalog.list({})).flatMap((component) =>
    component.tier === KIT && component.pkg !== null ? [{pkg: component.pkg, file: resolve(cwd, component.file)}] : [],
  )
  const found = await Promise.all(kits.map(({pkg, file}) => packageStylesheets({disk, pkg, dir: dirname(file)})))
  return uniq(found.flat())
}

async function packageStylesheets(input: {disk: Storage; pkg: string; dir: string}): Promise<string[]> {
  const {disk, pkg, dir} = input
  const manifest = PackageSchema.safeParse(await disk.getItem(join(dir, PACKAGE_JSON)).catch(() => null))
  if (manifest.success && manifest.data.name === pkg)
    return stylesheetTargets(manifest.data.exports).map((target) => join(dir, target))
  const parent = dirname(dir)
  return parent === dir ? [] : packageStylesheets({disk, pkg, dir: parent})
}

function stylesheetTargets(value: unknown): string[] {
  const leaf = z.string().safeParse(value)
  if (leaf.success) return leaf.data.endsWith(STYLESHEET) ? [leaf.data] : []
  const branch = z.record(z.string(), z.unknown()).safeParse(value)
  return branch.success ? Object.values(branch.data).flatMap(stylesheetTargets) : []
}

async function text(input: {disk: Storage; file: string}): Promise<string | null> {
  const raw = await input.disk.getItemRaw<Uint8Array>(input.file).catch(() => null)
  return raw === null || raw === undefined ? null : new TextDecoder().decode(raw)
}

function tokensIn(input: {file: string; nodes: ChildNode[]}): Token[] {
  return input.nodes.filter(rootRule).flatMap((rule) =>
    rule.nodes.flatMap((node) => {
      if (node.type !== 'decl' || !node.prop.startsWith(CUSTOM_PROPERTY)) return []
      return schemed(node.value.trim()).map((entry) => ({name: node.prop, ...entry, source: input.file}))
    }),
  )
}

function rootRule(node: ChildNode): node is Rule {
  return node.type === 'rule' && node.selectors.some((selector) => ROOT_SELECTORS.has(selector))
}

function schemed(value: string): Pick<Token, 'value' | 'scheme'>[] {
  if (!value.startsWith(LIGHT_DARK) || !value.endsWith(CLOSE)) return [{value, scheme: 'any'}]
  const [light, dark, ...rest] = postcss.list.comma(value.slice(LIGHT_DARK.length, -CLOSE.length))
  if (light === undefined || dark === undefined || rest.length > 0) return [{value, scheme: 'any'}]
  return [
    {value: light, scheme: 'light'},
    {value: dark, scheme: 'dark'},
  ]
}
