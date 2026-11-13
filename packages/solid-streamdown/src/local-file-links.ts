export type OpenLocalFile = (path: string) => void

export type LocalFileExists = (path: string) => boolean | Promise<boolean>

const MAX_LINE_NUMBER = 1_000_000

const lineHashPattern = /^#L(\d+)(?:C\d+)?(?:-L?(\d+)(?:C\d+)?)?$/i

const lineHashSuffixPattern = /^(.*?)#L(\d+)(?:C\d+)?(?:-L?(\d+)(?:C\d+)?)?$/i

const lineColonSuffixPattern = /^(.*?):(\d+)(?::\d+)?(?:-(\d+)(?::\d+)?)?:?$/

const fileNames = new Set([
  'CHANGELOG',
  'CODEOWNERS',
  'Containerfile',
  'Dockerfile',
  'Gemfile',
  'Justfile',
  'LICENSE',
  'Makefile',
  'Procfile',
  'README',
  'Rakefile',
  'Vagrantfile',
])

function toLineRange(first: number, second: number) {
  if (
    !Number.isSafeInteger(first) ||
    !Number.isSafeInteger(second) ||
    first < 1 ||
    second < 1 ||
    first > MAX_LINE_NUMBER ||
    second > MAX_LINE_NUMBER
  ) {
    return undefined
  }

  return {
    start: Math.min(first, second),
    end: Math.max(first, second),
  }
}

function isLineRangeHash(hash: string) {
  return lineHashPattern.test(hash)
}

function parsePathLineSuffix(input: string) {
  const hashMatch = input.match(lineHashSuffixPattern)

  if (hashMatch) {
    const first = Number(hashMatch[2])
    const second = hashMatch[3] ? Number(hashMatch[3]) : first

    return {
      path: hashMatch[1] ?? '',
      selection: toLineRange(first, second),
    }
  }

  const colonMatch = input.match(lineColonSuffixPattern)

  if (colonMatch && !/^[a-z]:?$/i.test(colonMatch[1] ?? '')) {
    const first = Number(colonMatch[2])
    const second = colonMatch[3] ? Number(colonMatch[3]) : first

    return {
      path: colonMatch[1] ?? '',
      selection: toLineRange(first, second),
    }
  }

  return {path: input, selection: undefined}
}

function hasControlCharacter(value: string) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 0x1f || code === 0x7f
  })
}

function decodePath(value: string) {
  try {
    const path = decodeURIComponent(value)

    if (hasControlCharacter(path) || path.startsWith('//') || path.startsWith('\\\\')) return

    return path
  } catch {
    return
  }
}

function fileUrlPath(value: string) {
  if (!URL.canParse(value)) return
  const url = new URL(value)

  if (url.hostname && url.hostname !== 'localhost') return

  return decodePath(url.pathname.replace(/^\/([a-z]:\/)/i, '$1'))
}

function localPath(source: string) {
  const value = source.trim().replace(/\\|%5c/gi, '/')

  if (!value || hasControlCharacter(value) || value.startsWith('//')) return

  if (/^file:/i.test(value)) return fileUrlPath(value)

  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[a-z]:\//i.test(value)) return

  return decodePath(value)
}

export function localLinkPath(href: string) {
  const value = href.trim()

  if (!value || value.startsWith('#') || value.startsWith('?')) return

  const hashIndex = value.indexOf('#')
  const hash = hashIndex === -1 ? '' : value.slice(hashIndex)
  const target = (value.split(/[?#]/, 1)[0] ?? '').replace(/\\|%5c/gi, '/')
  const cited = parsePathLineSuffix(target)
  const line = cited.path !== target && /[./]/.test(cited.path) ? cited : undefined
  const base = localPath(line?.path ?? target)

  if (!base) return

  if (line?.selection) {
    const range = line.selection.end === line.selection.start ? '' : `-L${line.selection.end}`

    return `${base}#L${line.selection.start}${range}`
  }

  return `${base}${isLineRangeHash(hash) ? hash : ''}`
}

export function isInlineCodePath(text: string) {
  if (/^https?:\/\//i.test(text)) return false

  if (!text || /\s/.test(text) || /^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return false

  if (/[{}<>"'`;=|&*,]/.test(text)) return false

  if (/^[\\/]{2}/.test(text)) return false

  const path = parsePathLineSuffix(text).path

  if (fileNames.has(path)) return true

  return /[./\\]/.test(path) && /[a-z]/i.test(path)
}

export function localLinkTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return
  const link = target.closest('a[data-local-link]')

  if (link instanceof HTMLElement) return link.dataset.localLink
  const code = target.closest(':not(pre) > code[data-inline-code-kind="path"]')

  if (code instanceof HTMLElement && !code.closest('a')) return code.textContent?.trim() || undefined
}
