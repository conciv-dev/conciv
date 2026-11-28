export const FIGMA_KEY_MISSING = 'the Figma key is missing'
export const FIGMA_KEY_REFUSED = 'Figma refused the token'
export const FIGMA_KEY_PRIVATE = 'Your key stays private'
export const FIGMA_KEY_PRIVATE_DESCRIPTION =
  'The key is saved on this computer and used only to call Figma. The agent and the chat only ever see it hidden.'

export const asksForFigmaKey = (error: string) =>
  [FIGMA_KEY_MISSING, FIGMA_KEY_REFUSED].some((asked) => error.includes(asked))
