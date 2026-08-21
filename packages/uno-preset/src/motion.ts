import type {StaticShortcutMap} from 'unocss'

export const motion = {
  'anim-dot1': 'animate-pw-dot animate-duration-[1.2s] animate-iteration-count-infinite motion-reduce:animate-none',
  'anim-dot2':
    'animate-pw-dot animate-duration-[1.2s] animate-delay-[0.15s] animate-iteration-count-infinite motion-reduce:animate-none',
  'anim-dot3':
    'animate-pw-dot animate-duration-[1.2s] animate-delay-[0.3s] animate-iteration-count-infinite motion-reduce:animate-none',
  'anim-msg': 'animate-pw-fade-in-up animate-duration-[160ms] animate-ease-pw motion-reduce:animate-none',
  'anim-msg-lg': 'animate-pw-fade-in-up animate-duration-[180ms] animate-ease-pw motion-reduce:animate-none',
  'anim-rise':
    'animate-pw-fade-in-up animate-duration-[320ms] animate-ease-pw-expo animate-fill-mode-backwards motion-reduce:animate-none',
  'anim-rise-d':
    'animate-pw-fade-in-up animate-duration-[320ms] animate-ease-pw-expo animate-delay-[40ms] animate-fill-mode-backwards motion-reduce:animate-none',
  'anim-switching': 'animate-pulse animate-duration-[1.2s] motion-reduce:animate-none',

  'anim-combo': 'animate-fade-in animate-duration-[120ms] animate-ease-pw motion-reduce:animate-none',
  'anim-compact': 'animate-spin animate-duration-[0.85s] motion-reduce:animate-none',
  'anim-fab': 'animate-pw-zoom-in animate-duration-[360ms] animate-ease-pw-expo motion-reduce:animate-none',
  'anim-fab-ring':
    'animate-pw-fab-ring animate-duration-[1.6s] animate-ease-pw animate-iteration-count-infinite motion-reduce:animate-none',
  'anim-now': 'animate-fade-in animate-duration-[220ms] animate-ease-pw motion-reduce:animate-none',
  'anim-collapse-open':
    'animate-pw-collapse-open animate-duration-[200ms] animate-ease-pw motion-reduce:animate-duration-[0.01ms]',
  'anim-collapse-closed':
    'animate-pw-collapse-close animate-duration-[200ms] animate-ease-pw animate-fill-mode-forwards motion-reduce:animate-duration-[0.01ms]',

  'anim-pop': 'animate-pw-fade-in-up animate-duration-[200ms] animate-ease-pw-expo motion-reduce:animate-none',
  'anim-presence-in': 'animate-pw-presence-in animate-duration-[180ms] animate-ease-pw-expo motion-reduce:animate-none',
  'anim-presence-out':
    'animate-pw-presence-out animate-duration-[120ms] animate-ease-pw animate-fill-mode-both motion-reduce:animate-none',
  'anim-tab-right':
    'animate-pw-slide-in-right animate-duration-[200ms] animate-ease-pw-expo motion-reduce:animate-none',
  'anim-tab-left': 'animate-pw-slide-in-left animate-duration-[200ms] animate-ease-pw-expo motion-reduce:animate-none',
  'anim-pulse': 'animate-pulse animate-duration-[1.4s] motion-reduce:animate-none',
  'anim-skel': 'animate-pulse animate-duration-[1.2s] motion-reduce:animate-none',
  'anim-tool-spin': 'animate-spin animate-duration-[0.7s] motion-reduce:animate-none',
  'anim-run-ring':
    'animate-pw-run-pulse animate-duration-[1.5s] animate-ease-in-out animate-iteration-count-infinite motion-reduce:animate-none',
  'anim-think-shimmer':
    'animate-pw-think-shimmer animate-duration-[1.6s] animate-ease-linear animate-iteration-count-infinite motion-reduce:animate-none',

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
