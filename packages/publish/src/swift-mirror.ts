import {createHash} from 'node:crypto'
import {cp, mkdir, readFile, readdir, rm} from 'node:fs/promises'
import {join} from 'node:path'
import {z} from 'zod'

const BARE_SEMVER = /^\d+\.\d+\.\d+$/

const SKIP_SEGMENTS = ['.build', '.git', '.DS_Store']

const MIRROR_ENTRIES = ['Package.swift', 'Sources', 'Tests', 'README.md', 'RELEASE_HYGIENE.md']

const bridgeManifestSchema = z.object({version: z.string()})

export function assertBareSemver(version: string): void {
  if (!BARE_SEMVER.test(version)) {
    throw new Error(`invalid swift sdk version ${JSON.stringify(version)}: must match /^\\d+\\.\\d+\\.\\d+$/`)
  }
}

export async function readBridgeVersion(manifestPath: string): Promise<string> {
  const raw = await readFile(manifestPath, 'utf8')
  const {version} = bridgeManifestSchema.parse(JSON.parse(raw))
  assertBareSemver(version)
  return version
}

function isSkipped(path: string): boolean {
  return SKIP_SEGMENTS.some((segment) => path.includes(`/${segment}/`) || path.endsWith(`/${segment}`))
}

export type MirrorLayout = {
  sourceDir: string
  templateDir: string
  destDir: string
  bridgeManifestPath: string
}

export type MirrorTree = {
  version: string
  files: string[]
}

export async function assembleMirrorTree(layout: MirrorLayout): Promise<MirrorTree> {
  const version = await readBridgeVersion(layout.bridgeManifestPath)
  for (const entry of MIRROR_ENTRIES) {
    await rm(join(layout.destDir, entry), {recursive: true, force: true})
  }
  await mkdir(layout.destDir, {recursive: true})
  const plan = [
    {from: join(layout.sourceDir, 'Package.swift'), to: 'Package.swift'},
    {from: join(layout.sourceDir, 'Sources'), to: 'Sources'},
    {from: join(layout.sourceDir, 'Tests'), to: 'Tests'},
    {from: join(layout.templateDir, 'README.md'), to: 'README.md'},
    {from: join(layout.templateDir, 'RELEASE_HYGIENE.md'), to: 'RELEASE_HYGIENE.md'},
  ]
  for (const {from, to} of plan) {
    await cp(from, join(layout.destDir, to), {recursive: true, filter: (src) => !isSkipped(src)})
  }
  return {version, files: MIRROR_ENTRIES}
}

async function walkTree(dir: string, rel: string, out: string[]): Promise<void> {
  for (const entry of await readdir(join(dir, rel), {withFileTypes: true})) {
    const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`
    if (isSkipped(`/${childRel}`)) continue
    if (entry.isDirectory()) {
      await walkTree(dir, childRel, out)
      continue
    }
    const content = await readFile(join(dir, childRel))
    out.push(`${childRel}\0${createHash('sha256').update(content).digest('hex')}`)
  }
}

export async function fingerprintTree(dir: string): Promise<string> {
  const entries: string[] = []
  await walkTree(dir, '', entries)
  return entries.toSorted().join('\n')
}

export async function treesMatch(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([fingerprintTree(a), fingerprintTree(b)])
  return left === right
}
