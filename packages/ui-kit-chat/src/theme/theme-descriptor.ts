export type ThemeFontFace = {
  family: string
  src: string
  weight: string | number
  style?: string
}

export type ChatTheme = {
  id: string
  fonts: ThemeFontFace[]
}

let active: ChatTheme | null = null

export function setActiveChatTheme(theme: ChatTheme): void {
  active = theme
}

export function activeChatTheme(): ChatTheme | null {
  return active
}
