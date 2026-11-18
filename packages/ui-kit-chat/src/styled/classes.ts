export const FOCUS = 'focus-visible:[outline:var(--chat-focus)] focus-visible:[outline-offset:0.125rem]'
export const FOCUS_INSET = 'focus-visible:[outline:var(--chat-focus)] focus-visible:[outline-offset:-2px]'
const REMOVE_REVEAL =
  'absolute transition-opacity motion-reduce:transition-none media-mouse:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
export const REMOVE_WRAPPER = `${REMOVE_REVEAL} end-0.5 top-0.5`
export const CORNER_REMOVE_WRAPPER = `${REMOVE_REVEAL} -top-3 -end-3`
export const REMOVE = `inline-flex items-center justify-center size-6 border border-chat-line rounded-chat-pill bg-chat-panel text-chat-text-2 cursor-pointer trans-btn hover:bg-chat-fill-strong hover:text-chat-danger ${FOCUS_INSET}`

export const HIGHLIGHT =
  'data-[highlighted]:[background:var(--chat-fill-strong)] data-[highlighted]:[color:var(--chat-text-hi)]'

export const SPIN = 'shrink-0 anim-tool-spin'
