const WHITESPACE = /\s/u

export function detectTrigger(
  text: string,
  triggerChar: string,
  cursorPosition: number,
): {query: string; offset: number} | null {
  const upToCursor = text.slice(0, cursorPosition)
  for (let i = upToCursor.length - 1; i >= 0; i--) {
    const char = upToCursor[i] ?? ''
    if (WHITESPACE.test(char)) return null
    if (!upToCursor.startsWith(triggerChar, i)) continue
    if (i > 0 && !WHITESPACE.test(upToCursor[i - 1] ?? '')) continue
    return {query: upToCursor.slice(i + triggerChar.length), offset: i}
  }
  return null
}
