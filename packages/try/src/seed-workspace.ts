import {mkdirSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'

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

function safeRelativePath(path: string): boolean {
  if (path.startsWith('/') || path.includes('\\')) return false
  const segments = path.split('/')
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

function manifestEntries(parsed: unknown): [string, string][] {
  if (typeof parsed !== 'object' || parsed === null) return []
  return Object.entries(parsed).filter(
    (entry): entry is [string, string] => safeRelativePath(entry[0]) && typeof entry[1] === 'string',
  )
}

export async function seedWorkspace(origin: string, root: string): Promise<boolean> {
  let parsed: unknown
  try {
    const response = await fetch(`${origin}/site-source.json`)
    if (!response.ok) return false
    parsed = await response.json()
  } catch {
    return false
  }
  for (const [path, content] of manifestEntries(parsed)) {
    const target = join(root, path)
    mkdirSync(dirname(target), {recursive: true})
    writeFileSync(target, content)
  }
  writeFileSync(join(root, 'AGENTS.md'), AGENTS_TEXT)
  return true
}
