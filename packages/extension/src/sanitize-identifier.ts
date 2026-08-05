export const SANDBOX_BINDING_PREFIX = 'external_'

const UNSAFE_IDENTIFIER_CHARS = /[^A-Za-z0-9_$]/g
const LEADING_DIGIT = /^[0-9]/

const RESERVED_WORDS = new Set([
  'arguments',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'eval',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
])

export function sanitizeIdentifier(name: string): string {
  const replaced = name.replace(UNSAFE_IDENTIFIER_CHARS, '_')
  const prefixed = LEADING_DIGIT.test(replaced) ? `_${replaced}` : replaced
  if (RESERVED_WORDS.has(prefixed)) return `_${prefixed}`
  return prefixed
}

export function uniqueIdentifier(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  const suffix = {value: 2}
  while (taken.has(`${base}_${suffix.value}`)) suffix.value += 1
  return `${base}_${suffix.value}`
}
