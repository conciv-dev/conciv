export const FIGMA_KEY_MISSING = 'the Figma key is missing'
export const FIGMA_KEY_REFUSED = 'Figma refused the token'
export const FIGMA_KEY_PRIVATE = 'Your key stays private'
export const FIGMA_KEY_PRIVATE_DESCRIPTION =
  'The key is saved on this computer and used only to call Figma. The agent and the chat only ever see it hidden.'

const FIGMA_KEY_ASKS: readonly (readonly [cause: string, line: string])[] = [
  [FIGMA_KEY_MISSING, 'Figma needs a key to read this frame.'],
  [FIGMA_KEY_REFUSED, 'Figma refused the saved key.'],
]

export const readFigmaKeyAsk = (error: string): string | undefined =>
  FIGMA_KEY_ASKS.find(([cause]) => error.includes(cause))?.[1]
