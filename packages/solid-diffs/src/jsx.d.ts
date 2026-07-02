import 'solid-js'

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'diffs-container': JSX.HTMLAttributes<HTMLElement>
    }
  }
}
