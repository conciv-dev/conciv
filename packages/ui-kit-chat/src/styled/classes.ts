export const FOCUS = 'focus-visible:[outline:var(--chat-focus)] focus-visible:[outline-offset:0.125rem]'
export const FOCUS_INSET = 'focus-visible:[outline:var(--chat-focus)] focus-visible:[outline-offset:-2px]'
export const REMOVE = `absolute -top-1 -end-1 size-4 rounded-full bg-transparent text-white transition-opacity motion-reduce:transition-none media-mouse:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 ${FOCUS}`

export const HIGHLIGHT =
  'data-[highlighted]:[background:var(--chat-fill-strong)] data-[highlighted]:[color:var(--chat-text-hi)]'

export const SPIN = 'shrink-0 anim-tool-spin'
