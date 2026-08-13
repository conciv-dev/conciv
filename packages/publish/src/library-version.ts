import {readFile, readdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

const SKILLS_PACKAGE_DIR = 'packages/skills'
const SKILLS_MANIFEST = join(SKILLS_PACKAGE_DIR, 'package.json')
const SKILLS_DIR = join(SKILLS_PACKAGE_DIR, 'skills')

export type LibraryVersionRewrite = {file: string; from: string; to: string}

function readVersionField(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null || !('version' in raw)) return null
  const {version} = raw
  return typeof version === 'string' ? version : null
}

async function readSkillsPackageVersion(cwd: string): Promise<string> {
  const manifestPath = join(cwd, SKILLS_MANIFEST)
  const version = readVersionField(JSON.parse(await readFile(manifestPath, 'utf8')))
  if (version === null) {
    throw new Error(`${manifestPath}: missing a string "version" field`)
  }
  return version
}

async function skillMarkdownFiles(cwd: string): Promise<string[]> {
  const skillsDir = join(cwd, SKILLS_DIR)
  const entries = await readdir(skillsDir, {withFileTypes: true})
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(skillsDir, entry.name, 'SKILL.md'))
    .toSorted()
}

const libraryVersionPattern = /(\n\s*library_version:\s*')([^']*)(')/

export async function rewriteLibraryVersionStamps(cwd: string): Promise<LibraryVersionRewrite[]> {
  const version = await readSkillsPackageVersion(cwd)
  const files = await skillMarkdownFiles(cwd)
  const rewrites: LibraryVersionRewrite[] = []
  for (const file of files) {
    const content = await readFile(file, 'utf8')
    const match = content.match(libraryVersionPattern)
    if (match === null) {
      throw new Error(`${file}: missing metadata.library_version, cannot stamp the release version`)
    }
    const from = match[2]
    if (from === undefined) {
      throw new Error(`${file}: could not read the current metadata.library_version value`)
    }
    if (from === version) continue
    await writeFile(file, content.replace(libraryVersionPattern, `$1${version}$3`))
    rewrites.push({file, from, to: version})
  }
  return rewrites
}
