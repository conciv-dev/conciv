export const FOCUS = 'focus-visible:[outline:var(--chat-focus)] focus-visible:[outline-offset:0.125rem]'
export const REMOVE_WRAPPER = 'absolute end-0.5 top-0.5'
export const REMOVE = `inline-flex items-center justify-center size-6 rounded-[var(--chat-radius-pill)] [background:var(--chat-panel)] [color:var(--chat-text-2)] shadow-[var(--chat-shadow-lg)] cursor-pointer hover:[color:var(--chat-danger)] ${FOCUS}`

export const FOCUS_INSET = 'focus-visible:[outline:var(--chat-focus)] focus-visible:[outline-offset:-2px]'

export const HIGHLIGHT =
  'data-[highlighted]:[background:var(--chat-fill-strong)] data-[highlighted]:[color:var(--chat-text-hi)]'

export const SPIN = 'shrink-0 anim-tool-spin'
