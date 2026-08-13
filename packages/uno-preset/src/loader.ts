import {toEscapedSelector, type Preflight, type Rule, type StaticShortcutMap} from 'unocss'

export const loaderShortcuts = {
  'loader-orb':
    'relative [inline-size:var(--pw-loader-size)] [block-size:var(--pw-loader-size)] [animation:pw-loader-breathe_4s_cubic-bezier(0.4,0,0.6,1)_infinite] motion-reduce:[animation:none]',

  'loader-arc': 'absolute inset-0 rounded-pw-pill',

  'loader-arc-a':
    'opacity-80 [background:conic-gradient(from_var(--pw-loader-angle-a),transparent_0deg,currentColor_90deg,transparent_180deg)] [mask:radial-gradient(circle_at_50%_50%,transparent_calc(36.5%_-_2px),black_36.5%,black_38.5%,transparent_calc(38.5%_+_2px))] [animation:pw-loader-sweep-a_3s_linear_infinite] motion-reduce:hidden',
  'loader-arc-b':
    'opacity-90 [background:conic-gradient(from_var(--pw-loader-angle-b),transparent_0deg,currentColor_120deg,color-mix(in_srgb,currentColor_50%,transparent)_240deg,transparent_360deg)] [mask:radial-gradient(circle_at_50%_50%,transparent_calc(44%_-_2px),black_44%,black_48%,transparent_calc(48%_+_2px))] [animation:pw-loader-sweep-b_2.5s_cubic-bezier(0.4,0,0.6,1)_infinite] motion-reduce:opacity-40 motion-reduce:[animation:none]',
  'loader-arc-c':
    'opacity-35 [background:conic-gradient(from_var(--pw-loader-angle-c),transparent_0deg,color-mix(in_srgb,currentColor_60%,transparent)_45deg,transparent_90deg)] [mask:radial-gradient(circle_at_50%_50%,transparent_calc(54%_-_2px),black_54%,black_56%,transparent_calc(56%_+_2px))] [animation:pw-loader-sweep-c_4s_cubic-bezier(0.4,0,0.6,1)_infinite] motion-reduce:hidden',
  'loader-arc-d':
    'opacity-50 [background:conic-gradient(from_var(--pw-loader-angle-d),transparent_0deg,color-mix(in_srgb,currentColor_40%,transparent)_20deg,transparent_40deg)] [mask:radial-gradient(circle_at_50%_50%,transparent_calc(62%_-_1.5px),black_62%,black_63%,transparent_calc(63%_+_1.5px))] [animation:pw-loader-sweep-d_3.5s_linear_infinite] motion-reduce:hidden',

  'loader-text':
    'flex flex-col items-center gap-3 text-center [max-inline-size:22ch] [animation:pw-fade-in-up_1s_var(--pw-ease)_0.4s_backwards] motion-reduce:[animation:none]',
  'loader-label':
    'font-medium leading-[1.15] tracking-[-0.02em] text-balance [overflow-wrap:anywhere] [font-size:var(--pw-loader-label-size)] [color:color-mix(in_srgb,currentColor_90%,transparent)] [animation:pw-fade-in-up_0.8s_var(--pw-ease)_0.6s_backwards,pw-loader-label-pulse_3s_cubic-bezier(0.4,0,0.6,1)_1.4s_infinite] motion-reduce:[animation:none]',
  'loader-description':
    'leading-[1.45] tracking-[-0.01em] text-pretty [overflow-wrap:anywhere] [font-size:var(--pw-loader-description-size)] [color:color-mix(in_srgb,currentColor_60%,transparent)] [animation:pw-fade-in-up_0.8s_var(--pw-ease)_0.8s_backwards,pw-loader-description-pulse_4s_cubic-bezier(0.4,0,0.6,1)_1.6s_infinite] motion-reduce:[animation:none]',
} satisfies StaticShortcutMap

export const loaderRules: Rule[] = [
  [
    /^loader-size$/,
    (_match, {rawSelector}) => {
      const s = toEscapedSelector(rawSelector)
      return `
${s}{--pw-loader-size:8rem;--pw-loader-label-size:1rem;--pw-loader-description-size:0.875rem}
${s}[data-size='sm']{--pw-loader-size:5rem;--pw-loader-label-size:0.875rem;--pw-loader-description-size:0.75rem}
${s}[data-size='lg']{--pw-loader-size:10rem;--pw-loader-label-size:1.125rem;--pw-loader-description-size:1rem}
${s}[data-size='lg'] .loader-label{font-weight:600}
`
    },
  ],
]

export const loaderPreflight: Preflight = {
  getCSS: () => `
@property --pw-loader-angle-a{syntax:'<angle>';inherits:false;initial-value:0deg}
@property --pw-loader-angle-b{syntax:'<angle>';inherits:false;initial-value:0deg}
@property --pw-loader-angle-c{syntax:'<angle>';inherits:false;initial-value:180deg}
@property --pw-loader-angle-d{syntax:'<angle>';inherits:false;initial-value:270deg}

@supports not (background: conic-gradient(from var(--pw-loader-angle-a), red, blue)) {
  .loader-arc-a{background:conic-gradient(transparent 0deg,currentColor 90deg,transparent 180deg);animation:pw-loader-spin 3s linear infinite}
  .loader-arc-b{background:conic-gradient(transparent 0deg,currentColor 120deg,transparent 240deg);animation:pw-loader-spin 2.5s cubic-bezier(0.4,0,0.6,1) infinite}
  .loader-arc-c{background:conic-gradient(transparent 0deg,currentColor 45deg,transparent 90deg);animation:pw-loader-spin-reverse 4s cubic-bezier(0.4,0,0.6,1) infinite}
  .loader-arc-d{background:conic-gradient(transparent 0deg,currentColor 20deg,transparent 40deg);animation:pw-loader-spin 3.5s linear infinite}
}
`,
}
