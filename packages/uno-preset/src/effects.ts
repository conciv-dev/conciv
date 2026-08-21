import type {StaticShortcutMap} from 'unocss'

export const effects = {
  'focus-ring': 'focus-visible:[outline:0.125rem_solid_var(--chat-accent)] focus-visible:[outline-offset:0.125rem]',
  'focus-ring-always': 'focus:[outline:0.125rem_solid_var(--chat-accent)] focus:[outline-offset:0.125rem]',
  'focus-ring-inset-always': 'focus:[outline:0.125rem_solid_var(--chat-accent)] focus:[outline-offset:-0.125rem]',
  'ring-accent': '[box-shadow:0_0_0_0.1875rem_var(--chat-accent-08)]',
  'ring-inset-accent': '[box-shadow:inset_0_0_0_0.0625rem_var(--chat-accent)]',
  'skel-bg':
    '[background-image:linear-gradient(90deg,var(--chat-fill-soft)_25%,var(--chat-fill-strong)_50%,var(--chat-fill-soft)_75%)]',
  'accent-sweep': 'bg-[linear-gradient(90deg,transparent,var(--chat-accent),transparent)]',
} satisfies StaticShortcutMap
