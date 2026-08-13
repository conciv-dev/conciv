import {minimatch} from 'minimatch'

const CODE_FILE_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'css', 'html', 'json'])

function isTestPath(packageRelativePath: string): boolean {
  const segments = packageRelativePath.split('/')
  if (segments[0] === 'test' || segments[0] === 'tests') return true
  const base = segments.at(-1) ?? ''
  return /\.(test|spec)\./.test(base)
}

function isCodePath(packageRelativePath: string): boolean {
  const base = packageRelativePath.split('/').at(-1) ?? ''
  const dotIndex = base.lastIndexOf('.')
  if (dotIndex <= 0) return true
  const extension = base.slice(dotIndex + 1).toLowerCase()
  return CODE_FILE_EXTENSIONS.has(extension)
}

function matchesGlob(packageRelativePath: string, pattern: string): boolean {
  return minimatch(packageRelativePath, pattern) || minimatch(packageRelativePath, `${pattern}/**`)
}

function matchesFilesAllowlist(packageRelativePath: string, patterns: string[]): boolean {
  const includes = patterns.filter((pattern) => !pattern.startsWith('!'))
  const excludes = patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => pattern.slice(1))
  if (!includes.some((pattern) => matchesGlob(packageRelativePath, pattern))) return false
  return !excludes.some((pattern) => matchesGlob(packageRelativePath, pattern))
}

export function qualifiesForCoverage(packageRelativePath: string, filesAllowlist: string[] | undefined): boolean {
  if (isTestPath(packageRelativePath)) return false
  if (filesAllowlist && filesAllowlist.length > 0 && matchesFilesAllowlist(packageRelativePath, filesAllowlist)) {
    return true
  }
  return isCodePath(packageRelativePath)
}
