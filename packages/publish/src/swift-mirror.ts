import {cp, mkdir, readFile, rm} from 'node:fs/promises'
import {join} from 'node:path'

const BARE_SEMVER = /^\d+\.\d+\.\d+$/

const SKIP_SEGMENTS = ['.build', '.git', '.DS_Store']

const MIRROR_ENTRIES = ['Package.swift', 'Sources', 'Tests', 'README.md', 'RELEASE_HYGIENE.md']

export function assertBareSemver(version: string): void {
  if (!BARE_SEMVER.test(version)) {
    throw new Error(`invalid swift sdk version ${JSON.stringify(version)}: must match /^\\d+\\.\\d+\\.\\d+$/`)
  }
}

export async function readSwiftSdkVersion(sourceDir: string): Promise<string> {
  const raw = await readFile(join(sourceDir, 'SWIFT_SDK_VERSION'), 'utf8')
  const version = raw.trim()
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
}

export type MirrorTree = {
  version: string
  files: string[]
}

export async function assembleMirrorTree(layout: MirrorLayout): Promise<MirrorTree> {
  const version = await readSwiftSdkVersion(layout.sourceDir)
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
