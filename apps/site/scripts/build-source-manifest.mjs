import {mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join, relative} from 'node:path'
import {fileURLToPath} from 'node:url'

const TEXT_EXTENSIONS = ['.ts', '.tsx', '.css', '.md', '.mdx', '.json', '.txt', '.svg']
const SECRET_PATTERN = /(^|[./])(env|secret|secrets|credential|credentials|key|keys|token|password)($|[./])/i

function isTextFile(path) {
  return TEXT_EXTENSIONS.some((extension) => path.endsWith(extension))
}

function isSecretFile(path) {
  return SECRET_PATTERN.test(path)
}

function collectFiles(dir) {
  return readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? collectFiles(path) : entry.isFile() ? [path] : []
  })
}

export function buildManifest(siteDir) {
  const sourceDir = join(siteDir, 'src')
  const files = collectFiles(sourceDir).filter((path) => isTextFile(path) && !isSecretFile(path))
  const entries = files.map((file) => [relative(siteDir, file).split('\\').join('/'), readFileSync(file, 'utf8')])
  entries.push(['package.json', readFileSync(join(siteDir, 'package.json'), 'utf8')])
  return Object.fromEntries(entries)
}

const executedDirectly = process.argv[1] === fileURLToPath(import.meta.url)
if (executedDirectly) {
  const siteDir = fileURLToPath(new URL('..', import.meta.url))
  mkdirSync(join(siteDir, 'public'), {recursive: true})
  writeFileSync(join(siteDir, 'public', 'site-source.json'), JSON.stringify(buildManifest(siteDir)))
}
