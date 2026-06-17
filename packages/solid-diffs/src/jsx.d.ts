import 'solid-js'

// @pierre/diffs renders into its own custom element <diffs-container> (a shadow-root host it
// registers on import). Declare it so the wrappers can render the tag with a typed ref.
declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'diffs-container': JSX.HTMLAttributes<HTMLElement>
    }
  }
}
