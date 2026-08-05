const UNSAFE_IDENTIFIER_CHARS = /[^A-Za-z0-9_$]/g
const LEADING_DIGIT = /^[0-9]/

export function sanitizeIdentifier(name: string): string {
  const replaced = name.replace(UNSAFE_IDENTIFIER_CHARS, '_')
  return LEADING_DIGIT.test(replaced) ? `_${replaced}` : replaced
}
