// Shared styled-set class fragments so a11y/motion treatments live in one place (not copy-pasted per
// component). Reference only --chat-* tokens. SHIMMER lives in shimmer.js.

// Keyboard focus ring. INSET sits inside bordered cards (offset -2px so the ring hugs the border);
// the default sits just outside standalone controls (pills, scroll pin).
export const FOCUS = 'focus-visible:[outline:var(--chat-focus)] focus-visible:[outline-offset:0.125rem]'
export const FOCUS_INSET = 'focus-visible:[outline:var(--chat-focus)] focus-visible:[outline-offset:-2px]'

// Ark Menu / listbox keyboard highlight — the active item during arrow-key nav carries data-highlighted.
// Without this, keyboard users see no selection (hover styles alone never fire for the keyboard).
export const HIGHLIGHT =
  'data-[highlighted]:[background:var(--chat-fill-strong)] data-[highlighted]:[color:var(--chat-text-hi)]'

// Indeterminate spinner, reduced-motion safe.
export const SPIN = 'shrink-0 [animation:spin_0.6s_linear_infinite] motion-reduce:[animation:none]'
