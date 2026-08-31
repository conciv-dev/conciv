import type {StaticShortcutMap} from 'unocss'

export const motion = {
  'anim-dot1': 'animate-chat-dot animate-duration-[1.2s] animate-iteration-count-infinite motion-reduce:animate-none',
  'anim-dot2':
    'animate-chat-dot animate-duration-[1.2s] animate-delay-[0.15s] animate-iteration-count-infinite motion-reduce:animate-none',
  'anim-dot3':
    'animate-chat-dot animate-duration-[1.2s] animate-delay-[0.3s] animate-iteration-count-infinite motion-reduce:animate-none',
  'anim-msg': 'animate-chat-fade-in-up animate-duration-[160ms] animate-ease-chat motion-reduce:animate-none',
  'anim-msg-lg': 'animate-chat-fade-in-up animate-duration-[180ms] animate-ease-chat motion-reduce:animate-none',
  'anim-rise':
    'animate-chat-fade-in-up animate-duration-[320ms] animate-ease-chat-expo animate-fill-mode-backwards motion-reduce:animate-none',
  'anim-rise-d':
    'animate-chat-fade-in-up animate-duration-[320ms] animate-ease-chat-expo animate-delay-[40ms] animate-fill-mode-backwards motion-reduce:animate-none',
  'anim-switching': 'animate-pulse animate-duration-[1.2s] motion-reduce:animate-none',

  'anim-combo': 'animate-fade-in animate-duration-[120ms] animate-ease-chat motion-reduce:animate-none',
  'anim-compact': 'animate-spin animate-duration-[0.85s] motion-reduce:animate-none',
  'anim-fab': 'animate-chat-zoom-in animate-duration-[360ms] animate-ease-chat-expo motion-reduce:animate-none',
  'anim-fab-ring':
    'animate-chat-fab-ring animate-duration-[1.6s] animate-ease-chat animate-iteration-count-infinite motion-reduce:animate-none',
  'anim-now': 'animate-fade-in animate-duration-[220ms] animate-ease-chat motion-reduce:animate-none',
  'anim-word-in': 'animate-chat-word-in animate-duration-[200ms] animate-ease-chat motion-reduce:animate-none',
  'anim-word-out': 'animate-chat-word-out animate-duration-[160ms] animate-ease-chat motion-reduce:animate-none',
  'anim-collapse-open':
    'animate-chat-collapse-open animate-duration-[200ms] animate-ease-chat motion-reduce:animate-duration-[0.01ms]',
  'anim-collapse-closed':
    'animate-chat-collapse-close animate-duration-[200ms] animate-ease-chat animate-fill-mode-forwards motion-reduce:animate-duration-[0.01ms]',

  'anim-pop': 'animate-chat-fade-in-up animate-duration-[200ms] animate-ease-chat-expo motion-reduce:animate-none',
  'anim-presence-in':
    'animate-chat-presence-in animate-duration-[180ms] animate-ease-chat-expo motion-reduce:animate-none',
  'anim-presence-out':
    'animate-chat-presence-out animate-duration-[120ms] animate-ease-chat animate-fill-mode-both motion-reduce:animate-none',
  'anim-tab-right':
    'animate-chat-slide-in-right animate-duration-[200ms] animate-ease-chat-expo motion-reduce:animate-none',
  'anim-tab-left':
    'animate-chat-slide-in-left animate-duration-[200ms] animate-ease-chat-expo motion-reduce:animate-none',
  'anim-pulse': 'animate-pulse animate-duration-[1.4s] motion-reduce:animate-none',
  'anim-skel': 'animate-pulse animate-duration-[1.2s] motion-reduce:animate-none',
  'anim-tool-spin': 'animate-spin animate-duration-[0.7s] motion-reduce:animate-none',
  'anim-run-ring':
    'animate-chat-run-pulse animate-duration-[1.5s] animate-ease-in-out animate-iteration-count-infinite motion-reduce:animate-none',
  'anim-think-shimmer':
    'animate-chat-think-shimmer animate-duration-[1.6s] animate-ease-linear animate-iteration-count-infinite motion-reduce:animate-none',

  'trans-bg': '[transition:background-color_120ms_var(--chat-ease)]',
  'trans-bg-tf': '[transition:background-color_120ms_var(--chat-ease),transform_100ms_var(--chat-ease)]',
  'trans-border': '[transition:border-color_120ms_var(--chat-ease)]',
  'trans-chip': '[transition:border-color_120ms_var(--chat-ease),background-color_120ms_var(--chat-ease)]',
  'trans-composer': '[transition:border-color_120ms_var(--chat-ease),box-shadow_120ms_var(--chat-ease)]',
  'trans-input':
    '[transition:border-color_120ms_var(--chat-ease),background-color_120ms_var(--chat-ease),transform_100ms_var(--chat-ease)]',
  'trans-color-bg': '[transition:color_120ms_var(--chat-ease),background-color_120ms_var(--chat-ease)]',
  'trans-cbb':
    '[transition:color_120ms_var(--chat-ease),border-color_120ms_var(--chat-ease),background-color_120ms_var(--chat-ease)]',
  'trans-send': '[transition:transform_100ms_var(--chat-ease),background-color_120ms_var(--chat-ease)]',
  'trans-btn':
    '[transition:transform_100ms_var(--chat-ease),background-color_120ms_var(--chat-ease),border-color_120ms_var(--chat-ease),color_120ms_var(--chat-ease)]',
  'trans-lift': '[transition:transform_140ms_var(--chat-ease),box-shadow_140ms_var(--chat-ease)]',
  'trans-tf150': '[transition:transform_150ms_var(--chat-ease)]',
  'trans-tf160': '[transition:transform_160ms_var(--chat-ease)]',
  'trans-tf-op': '[transition:transform_160ms_var(--chat-ease),opacity_120ms_var(--chat-ease)]',
  'trans-pop-in': '[transition:opacity_200ms_var(--chat-ease),transform_240ms_var(--chat-ease-expo),visibility_0s]',
  'trans-pop-out':
    '[transition:opacity_200ms_var(--chat-ease),transform_240ms_var(--chat-ease-expo),visibility_0s_linear_240ms]',
} satisfies StaticShortcutMap
