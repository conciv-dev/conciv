export const FOCUS = 'focus-visible:[outline:var(--chat-focus)] focus-visible:[outline-offset:0.125rem]'
export const FOCUS_INSET = 'focus-visible:[outline:var(--chat-focus)] focus-visible:[outline-offset:-2px]'
export const REMOVE_WRAPPER =
  'absolute end-1 top-1 transition-opacity motion-reduce:transition-none media-mouse:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
export const REMOVE = `inline-flex items-center justify-center size-6 border-0 rounded-chat-surface-sm bg-transparent text-chat-text-2 cursor-pointer trans-btn hover:bg-chat-fill-strong hover:text-chat-danger ${FOCUS_INSET}`

export const HIGHLIGHT =
  'data-[highlighted]:[background:var(--chat-fill-strong)] data-[highlighted]:[color:var(--chat-text-hi)]'

export const SPIN = 'shrink-0 anim-tool-spin'
