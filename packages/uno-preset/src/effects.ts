// Focus rings + token gradients that don't map to a single theme scale. Composite values (outline,
// box-shadow rings, linear-gradients) with their --pw-* var()s live here so component code stays
// name-only: `focus-ring`, `focus-within:ring-accent`, `after:accent-sweep`, etc.
import type {StaticShortcutMap} from 'unocss'

export const effects = {
  'focus-ring': 'focus-visible:[outline:0.125rem_solid_var(--pw-accent)] focus-visible:[outline-offset:0.125rem]',
  'ring-accent': '[box-shadow:0_0_0_0.1875rem_var(--pw-accent-08)]',
  'ring-inset-accent': '[box-shadow:inset_0_0_0_0.0625rem_var(--pw-accent)]',
  'skel-bg':
    '[background-image:linear-gradient(90deg,var(--pw-fill-soft)_25%,var(--pw-fill-strong)_50%,var(--pw-fill-soft)_75%)]',
  'accent-sweep': 'bg-[linear-gradient(90deg,transparent,var(--pw-accent),transparent)]',
} satisfies StaticShortcutMap
