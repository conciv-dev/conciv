import type {StaticShortcutMap} from 'unocss'

export const motion = {
  'anim-dot1': 'animate-pw-dot animate-duration-[1.2s] animate-iteration-count-infinite',
  'anim-dot2': 'animate-pw-dot animate-duration-[1.2s] animate-delay-[0.15s] animate-iteration-count-infinite',
  'anim-dot3': 'animate-pw-dot animate-duration-[1.2s] animate-delay-[0.3s] animate-iteration-count-infinite',
  'anim-msg': 'animate-fade-in-up animate-duration-[160ms] animate-ease-pw',
  'anim-msg-lg': 'animate-fade-in-up animate-duration-[180ms] animate-ease-pw',
  'anim-rise': 'animate-fade-in-up animate-duration-[320ms] animate-ease-pw-expo animate-fill-mode-both',
  'anim-rise-d':
    'animate-fade-in-up animate-duration-[320ms] animate-ease-pw-expo animate-delay-[40ms] animate-fill-mode-both',
  'anim-switching': 'animate-pulse animate-duration-[1.2s]',

  'anim-combo': 'animate-fade-in animate-duration-[120ms] animate-ease-pw',
  'anim-compact': 'animate-spin animate-duration-[0.85s]',
  'anim-fab': 'animate-zoom-in animate-duration-[360ms] animate-ease-pw-expo animate-fill-mode-both',
  'anim-fab-ring': 'animate-pw-fab-ring animate-duration-[1.6s] animate-ease-pw animate-iteration-count-infinite',
  'anim-now': 'animate-fade-in animate-duration-[220ms] animate-ease-pw',
  'anim-collapse-open': 'animate-pw-expand-height animate-duration-[200ms] animate-ease-pw',
  'anim-collapse-closed':
    'animate-pw-collapse-height animate-duration-[200ms] animate-ease-pw animate-fill-mode-forwards',

  'anim-presence-in': 'animate-pw-presence-in animate-duration-[180ms] animate-ease-pw-expo animate-fill-mode-both',
  'anim-presence-out': 'animate-pw-presence-out animate-duration-[120ms] animate-ease-pw animate-fill-mode-both',
  'anim-pulse': 'animate-pulse animate-duration-[1.4s]',
  'anim-skel': 'animate-pulse animate-duration-[1.2s]',
  'anim-test-rot': 'animate-spin animate-duration-[0.7s]',
  'anim-tool-spin': 'animate-spin animate-duration-[0.7s]',
  'anim-think-shimmer':
    'animate-pw-think-shimmer animate-duration-[1.6s] animate-ease-linear animate-iteration-count-infinite',

  'trans-bg': '[transition:background-color_120ms_var(--pw-ease)]',
  'trans-bg-tf': '[transition:background-color_120ms_var(--pw-ease),transform_100ms_var(--pw-ease)]',
  'trans-border': '[transition:border-color_120ms_var(--pw-ease)]',
  'trans-chip': '[transition:border-color_120ms_var(--pw-ease),background-color_120ms_var(--pw-ease)]',
  'trans-composer': '[transition:border-color_120ms_var(--pw-ease),box-shadow_120ms_var(--pw-ease)]',
  'trans-input':
    '[transition:border-color_120ms_var(--pw-ease),background-color_120ms_var(--pw-ease),transform_100ms_var(--pw-ease)]',
  'trans-color-bg': '[transition:color_120ms_var(--pw-ease),background-color_120ms_var(--pw-ease)]',
  'trans-cbb':
    '[transition:color_120ms_var(--pw-ease),border-color_120ms_var(--pw-ease),background-color_120ms_var(--pw-ease)]',
  'trans-send': '[transition:transform_100ms_var(--pw-ease),background-color_120ms_var(--pw-ease)]',
  'trans-btn':
    '[transition:transform_100ms_var(--pw-ease),background-color_120ms_var(--pw-ease),border-color_120ms_var(--pw-ease),color_120ms_var(--pw-ease)]',
  'trans-lift': '[transition:transform_140ms_var(--pw-ease),box-shadow_140ms_var(--pw-ease)]',
  'trans-tf150': '[transition:transform_150ms_var(--pw-ease)]',
  'trans-tf160': '[transition:transform_160ms_var(--pw-ease)]',
  'trans-tf-op': '[transition:transform_160ms_var(--pw-ease),opacity_120ms_var(--pw-ease)]',
  'trans-pop-in': '[transition:opacity_200ms_var(--pw-ease),transform_240ms_var(--pw-ease-expo),visibility_0s]',
  'trans-pop-out':
    '[transition:opacity_200ms_var(--pw-ease),transform_240ms_var(--pw-ease-expo),visibility_0s_linear_240ms]',
} satisfies StaticShortcutMap
