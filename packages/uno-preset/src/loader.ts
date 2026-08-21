import {toEscapedSelector, type Preflight, type Rule, type StaticShortcutMap} from 'unocss'

export const loaderShortcuts = {
  'loader-arc': 'absolute inset-0 rounded-chat-pill',
} satisfies StaticShortcutMap

function blockRule(name: string, css: (selector: string) => string): Rule {
  return [new RegExp(`^${name}$`), (_match, {rawSelector}) => css(toEscapedSelector(rawSelector))]
}

export const loaderRules: Rule[] = [
  blockRule(
    'loader-size',
    (s) => `
${s} {
  --chat-loader-size: 8rem;
  --chat-loader-label-size: 1rem;
  --chat-loader-description-size: 0.875rem;
}
${s}[data-size='sm'] {
  --chat-loader-size: 5rem;
  --chat-loader-label-size: 0.875rem;
  --chat-loader-description-size: 0.75rem;
}
${s}[data-size='lg'] {
  --chat-loader-size: 10rem;
  --chat-loader-label-size: 1.125rem;
  --chat-loader-description-size: 1rem;
}
${s}[data-size='lg'] .loader-label {
  font-weight: 600;
}
`,
  ),
  blockRule(
    'loader-orb',
    (s) => `
${s} {
  position: relative;
  inline-size: var(--chat-loader-size);
  block-size: var(--chat-loader-size);
  animation: chat-loader-breathe 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
@media (prefers-reduced-motion: reduce) {
  ${s} {
    animation: none;
  }
}
`,
  ),
  blockRule(
    'loader-arc-a',
    (s) => `
${s} {
  opacity: 0.8;
  background: conic-gradient(from var(--chat-loader-angle-a), transparent 0deg, currentColor 90deg, transparent 180deg);
  mask: radial-gradient(
    circle at 50% 50%,
    transparent calc(36.5% - 2px),
    black 36.5%,
    black 38.5%,
    transparent calc(38.5% + 2px)
  );
  animation: chat-loader-sweep-a 3s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  ${s} {
    display: none;
  }
}
`,
  ),
  blockRule(
    'loader-arc-b',
    (s) => `
${s} {
  opacity: 0.9;
  background: conic-gradient(
    from var(--chat-loader-angle-b),
    transparent 0deg,
    currentColor 120deg,
    color-mix(in srgb, currentColor 50%, transparent) 240deg,
    transparent 360deg
  );
  mask: radial-gradient(
    circle at 50% 50%,
    transparent calc(44% - 2px),
    black 44%,
    black 48%,
    transparent calc(48% + 2px)
  );
  animation: chat-loader-sweep-b 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
@media (prefers-reduced-motion: reduce) {
  ${s} {
    opacity: 0.4;
    animation: none;
  }
}
`,
  ),
  blockRule(
    'loader-arc-c',
    (s) => `
${s} {
  opacity: 0.35;
  background: conic-gradient(
    from var(--chat-loader-angle-c),
    transparent 0deg,
    color-mix(in srgb, currentColor 60%, transparent) 45deg,
    transparent 90deg
  );
  mask: radial-gradient(
    circle at 50% 50%,
    transparent calc(54% - 2px),
    black 54%,
    black 56%,
    transparent calc(56% + 2px)
  );
  animation: chat-loader-sweep-c 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
@media (prefers-reduced-motion: reduce) {
  ${s} {
    display: none;
  }
}
`,
  ),
  blockRule(
    'loader-arc-d',
    (s) => `
${s} {
  opacity: 0.5;
  background: conic-gradient(
    from var(--chat-loader-angle-d),
    transparent 0deg,
    color-mix(in srgb, currentColor 40%, transparent) 20deg,
    transparent 40deg
  );
  mask: radial-gradient(
    circle at 50% 50%,
    transparent calc(62% - 1.5px),
    black 62%,
    black 63%,
    transparent calc(63% + 1.5px)
  );
  animation: chat-loader-sweep-d 3.5s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  ${s} {
    display: none;
  }
}
`,
  ),
  blockRule(
    'loader-text',
    (s) => `
${s} {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  text-align: center;
  max-inline-size: 22ch;
  animation: chat-fade-in-up 1s var(--chat-ease) 0.4s backwards;
}
@media (prefers-reduced-motion: reduce) {
  ${s} {
    animation: none;
  }
}
`,
  ),
  blockRule(
    'loader-label',
    (s) => `
${s} {
  font-weight: 500;
  font-size: var(--chat-loader-label-size);
  line-height: 1.15;
  letter-spacing: -0.02em;
  text-wrap: balance;
  overflow-wrap: anywhere;
  color: color-mix(in srgb, currentColor 90%, transparent);
  animation:
    chat-fade-in-up 0.8s var(--chat-ease) 0.6s backwards,
    chat-loader-label-pulse 3s cubic-bezier(0.4, 0, 0.6, 1) 1.4s infinite;
}
@media (prefers-reduced-motion: reduce) {
  ${s} {
    animation: none;
  }
}
`,
  ),
  blockRule(
    'loader-description',
    (s) => `
${s} {
  font-size: var(--chat-loader-description-size);
  line-height: 1.45;
  letter-spacing: -0.01em;
  text-wrap: pretty;
  overflow-wrap: anywhere;
  color: color-mix(in srgb, currentColor 60%, transparent);
  animation:
    chat-fade-in-up 0.8s var(--chat-ease) 0.8s backwards,
    chat-loader-description-pulse 4s cubic-bezier(0.4, 0, 0.6, 1) 1.6s infinite;
}
@media (prefers-reduced-motion: reduce) {
  ${s} {
    animation: none;
  }
}
`,
  ),
]

export const loaderPreflight: Preflight = {
  getCSS: () => `
@keyframes chat-loader-sweep-a {
  to {
    --chat-loader-angle-a: 360deg;
  }
}
@keyframes chat-loader-sweep-b {
  to {
    --chat-loader-angle-b: 360deg;
  }
}
@keyframes chat-loader-sweep-c {
  to {
    --chat-loader-angle-c: -180deg;
  }
}
@keyframes chat-loader-sweep-d {
  to {
    --chat-loader-angle-d: 630deg;
  }
}
@keyframes chat-loader-breathe {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.02);
  }
}
@keyframes chat-loader-label-pulse {
  0%,
  100% {
    opacity: 0.9;
  }
  50% {
    opacity: 0.7;
  }
}
@keyframes chat-loader-description-pulse {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 0.4;
  }
}
@property --chat-loader-angle-a {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
@property --chat-loader-angle-b {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
@property --chat-loader-angle-c {
  syntax: '<angle>';
  inherits: false;
  initial-value: 180deg;
}
@property --chat-loader-angle-d {
  syntax: '<angle>';
  inherits: false;
  initial-value: 270deg;
}
`,
}
