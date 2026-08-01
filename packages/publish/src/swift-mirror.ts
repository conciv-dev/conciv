import {createHash} from 'node:crypto'
import {cp, mkdir, readFile, readdir, rm} from 'node:fs/promises'
import {join} from 'node:path'
import {execa} from 'execa'
import {z} from 'zod'

const BARE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

const SKIP_SEGMENTS = ['.build', '.git', '.DS_Store']

const MIRROR_ENTRIES = ['Package.swift', 'Sources', 'Tests', 'README.md', 'RELEASE_HYGIENE.md', 'LICENSE']

const bridgeManifestSchema = z.object({version: z.string()})

export function assertBareSemver(version: string): void {
  if (!BARE_SEMVER.test(version)) {
    throw new Error(
      `invalid swift sdk version ${JSON.stringify(version)}: must be a bare semver major.minor.patch with no leading zeroes`,
    )
  }
}

export async function readBridgeVersion(manifestPath: string): Promise<string> {
  const raw = await readFile(manifestPath, 'utf8')
  const {version} = bridgeManifestSchema.parse(JSON.parse(raw))
  assertBareSemver(version)
  return version
}

function versionFieldNeedle(version: string): string {
  return `"version": "${version}"`
}

export async function resolveVersionCommit(cwd: string, manifestRelPath: string, version: string): Promise<string> {
  const {stdout} = await execa('git', [
    '-C',
    cwd,
    'log',
    '-1',
    '--format=%H',
    '-S',
    versionFieldNeedle(version),
    '--',
    manifestRelPath,
  ])
  const commit = stdout.trim()
  if (!commit) {
    throw new Error(
      `could not find the commit that set ${manifestRelPath} version to ${version}: the mirror tree must be anchored to the release commit, so full history is required (checkout with fetch-depth: 0)`,
    )
  }
  return commit
}

export async function extractCommitSubtree(
  cwd: string,
  commit: string,
  subpath: string,
  destDir: string,
): Promise<void> {
  await mkdir(destDir, {recursive: true})
  const {stdout} = await execa('git', ['-C', cwd, 'archive', '--format=tar', `${commit}:${subpath}`], {
    encoding: 'buffer',
  })
  await execa('tar', ['-x', '-f', '-', '-C', destDir], {input: stdout})
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
  await Promise.all(MIRROR_ENTRIES.map((entry) => rm(join(layout.destDir, entry), {recursive: true, force: true})))
  await mkdir(layout.destDir, {recursive: true})
  const plan = [
    {from: join(layout.sourceDir, 'Package.swift'), to: 'Package.swift'},
    {from: join(layout.sourceDir, 'Sources'), to: 'Sources'},
    {from: join(layout.sourceDir, 'Tests'), to: 'Tests'},
    {from: join(layout.templateDir, 'README.md'), to: 'README.md'},
    {from: join(layout.templateDir, 'RELEASE_HYGIENE.md'), to: 'RELEASE_HYGIENE.md'},
    {from: join(layout.templateDir, 'LICENSE'), to: 'LICENSE'},
  ]
  await Promise.all(
    plan.map(({from, to}) => cp(from, join(layout.destDir, to), {recursive: true, filter: (src) => !isSkipped(src)})),
  )
  return {version, files: MIRROR_ENTRIES}
}

async function walkTree(dir: string, rel: string): Promise<string[]> {
  const entries = await readdir(join(dir, rel), {withFileTypes: true})
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`
      if (isSkipped(`/${childRel}`)) return []
      if (entry.isDirectory()) return walkTree(dir, childRel)
      const content = await readFile(join(dir, childRel))
      return [`${childRel}\0${createHash('sha256').update(content).digest('hex')}`]
    }),
  )
  return nested.flat()
}

export async function fingerprintTree(dir: string): Promise<string> {
  return (await walkTree(dir, '')).toSorted().join('\n')
}

export async function treesMatch(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([fingerprintTree(a), fingerprintTree(b)])
  return left === right
}
