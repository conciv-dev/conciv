// The "thinking" shimmer — the project's standard text shimmer (the same `anim-think-shimmer` motion
// shortcut the old tool-ui used), in neutral --chat tokens. Notes:
// - background-IMAGE, not the `background` shorthand (the shorthand resets background-clip to border-box).
// - the `anim-think-shimmer` SHORTCUT (not an arbitrary [animation:...]) so uno emits the @keyframes.
// - bg-clip-text + text-transparent paint the gradient onto the glyphs; the keyframe sweeps it.
export const SHIMMER =
  '[background-image:linear-gradient(90deg,var(--chat-text-3),var(--chat-text-hi),var(--chat-text-3))] [background-size:200%_100%] bg-clip-text text-transparent anim-think-shimmer motion-reduce:animate-none motion-reduce:[color:var(--chat-text-3)]'
