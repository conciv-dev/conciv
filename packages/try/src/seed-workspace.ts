import {mkdirSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'

const MAX_MANIFEST_BYTES = 8 * 1024 * 1024

const AGENTS_TEXT = [
  '# This workspace',
  '',
  'This workspace contains the source of the page you are connected to: the conciv.dev landing',
  'page (`apps/site` of the conciv repo, `src/**` plus `package.json`).',
  '',
  '- Grabbed elements carry a `data-conciv-source="<file>:<line>:<col>"` attribute that maps',
  '  straight to these files. Read the file before explaining or changing anything.',
  '- File edits here are a local sandbox. Nothing redeploys and the live page does not rebuild.',
  '- Use the page tools for live visual changes, and show a diff of these files when the user',
  '  asks you to change something for real.',
  '',
].join('\n')

function allowedManifestPath(path: string): boolean {
  if (path === 'package.json') return true
  if (!path.startsWith('src/') || path.includes('\\')) return false
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

function manifestEntries(parsed: unknown): [string, string][] {
  if (typeof parsed !== 'object' || parsed === null) return []
  return Object.entries(parsed).filter(
    (entry): entry is [string, string] => allowedManifestPath(entry[0]) && typeof entry[1] === 'string',
  )
}

async function fetchManifest(origin: string): Promise<unknown> {
  const response = await fetch(`${origin}/site-source.json`)
  if (!response.ok) return null
  const declaredLength = Number(response.headers.get('content-length') ?? '0')
  if (declaredLength > MAX_MANIFEST_BYTES) return null
  const body = await response.text()
  if (body.length > MAX_MANIFEST_BYTES) return null
  return JSON.parse(body)
}

export async function seedWorkspace(origin: string, root: string): Promise<boolean> {
  let parsed: unknown
  try {
    parsed = await fetchManifest(origin)
  } catch {
    return false
  }
  if (parsed === null) return false
  for (const [path, content] of manifestEntries(parsed)) {
    try {
      const target = join(root, path)
      mkdirSync(dirname(target), {recursive: true})
      writeFileSync(target, content)
    } catch {
      continue
    }
  }
  writeFileSync(join(root, 'AGENTS.md'), AGENTS_TEXT)
  return true
}
