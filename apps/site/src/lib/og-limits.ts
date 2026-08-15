export const MAX_OG_TITLE_LENGTH = 70
export const MAX_OG_DESCRIPTION_LENGTH = 140

export function clampOgText(text: string, max: number) {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1).trimEnd()}…`
}
