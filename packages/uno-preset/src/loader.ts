import {toEscapedSelector, type Preflight, type Rule, type StaticShortcutMap} from 'unocss'

export const loaderShortcuts = {
  'loader-arc': 'absolute inset-0 rounded-pw-pill',
} satisfies StaticShortcutMap

function blockRule(name: string, css: (selector: string) => string): Rule {
  return [new RegExp(`^${name}$`), (_match, {rawSelector}) => css(toEscapedSelector(rawSelector))]
}

export const loaderRules: Rule[] = [
  blockRule(
    'loader-size',
    (s) => `
${s} {
  --pw-loader-size: 8rem;
  --pw-loader-label-size: 1rem;
  --pw-loader-description-size: 0.875rem;
}
${s}[data-size='sm'] {
  --pw-loader-size: 5rem;
  --pw-loader-label-size: 0.875rem;
  --pw-loader-description-size: 0.75rem;
}
${s}[data-size='lg'] {
  --pw-loader-size: 10rem;
  --pw-loader-label-size: 1.125rem;
  --pw-loader-description-size: 1rem;
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
  inline-size: var(--pw-loader-size);
  block-size: var(--pw-loader-size);
  animation: pw-loader-breathe 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
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
  background: conic-gradient(from var(--pw-loader-angle-a), transparent 0deg, currentColor 90deg, transparent 180deg);
  mask: radial-gradient(
    circle at 50% 50%,
    transparent calc(36.5% - 2px),
    black 36.5%,
    black 38.5%,
    transparent calc(38.5% + 2px)
  );
  animation: pw-loader-sweep-a 3s linear infinite;
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
    from var(--pw-loader-angle-b),
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
  animation: pw-loader-sweep-b 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
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
    from var(--pw-loader-angle-c),
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
  animation: pw-loader-sweep-c 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
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
    from var(--pw-loader-angle-d),
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
  animation: pw-loader-sweep-d 3.5s linear infinite;
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
  animation: pw-fade-in-up 1s var(--pw-ease) 0.4s backwards;
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
  font-size: var(--pw-loader-label-size);
  line-height: 1.15;
  letter-spacing: -0.02em;
  text-wrap: balance;
  overflow-wrap: anywhere;
  color: color-mix(in srgb, currentColor 90%, transparent);
  animation:
    pw-fade-in-up 0.8s var(--pw-ease) 0.6s backwards,
    pw-loader-label-pulse 3s cubic-bezier(0.4, 0, 0.6, 1) 1.4s infinite;
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
  font-size: var(--pw-loader-description-size);
  line-height: 1.45;
  letter-spacing: -0.01em;
  text-wrap: pretty;
  overflow-wrap: anywhere;
  color: color-mix(in srgb, currentColor 60%, transparent);
  animation:
    pw-fade-in-up 0.8s var(--pw-ease) 0.8s backwards,
    pw-loader-description-pulse 4s cubic-bezier(0.4, 0, 0.6, 1) 1.6s infinite;
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
@keyframes pw-loader-sweep-a {
  to {
    --pw-loader-angle-a: 360deg;
  }
}
@keyframes pw-loader-sweep-b {
  to {
    --pw-loader-angle-b: 360deg;
  }
}
@keyframes pw-loader-sweep-c {
  to {
    --pw-loader-angle-c: -180deg;
  }
}
@keyframes pw-loader-sweep-d {
  to {
    --pw-loader-angle-d: 630deg;
  }
}
@keyframes pw-loader-breathe {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.02);
  }
}
@keyframes pw-loader-spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes pw-loader-spin-reverse {
  to {
    transform: rotate(-360deg);
  }
}
@keyframes pw-loader-label-pulse {
  0%,
  100% {
    opacity: 0.9;
  }
  50% {
    opacity: 0.7;
  }
}
@keyframes pw-loader-description-pulse {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 0.4;
  }
}
@property --pw-loader-angle-a {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
@property --pw-loader-angle-b {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
@property --pw-loader-angle-c {
  syntax: '<angle>';
  inherits: false;
  initial-value: 180deg;
}
@property --pw-loader-angle-d {
  syntax: '<angle>';
  inherits: false;
  initial-value: 270deg;
}
@supports not (background: conic-gradient(from var(--pw-loader-angle-a), red, blue)) {
  .loader-arc-a {
    background: conic-gradient(transparent 0deg, currentColor 90deg, transparent 180deg);
    animation: pw-loader-spin 3s linear infinite;
  }
  .loader-arc-b {
    background: conic-gradient(transparent 0deg, currentColor 120deg, transparent 240deg);
    animation: pw-loader-spin 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
  .loader-arc-c {
    background: conic-gradient(transparent 0deg, currentColor 45deg, transparent 90deg);
    animation: pw-loader-spin-reverse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
  .loader-arc-d {
    background: conic-gradient(transparent 0deg, currentColor 20deg, transparent 40deg);
    animation: pw-loader-spin 3.5s linear infinite;
  }
}
`,
}
