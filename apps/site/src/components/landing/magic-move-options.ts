export function magicMoveOptions(shouldReduceMotion: boolean | null) {
  if (shouldReduceMotion) return {duration: 0, stagger: 0, animateContainer: false, containerStyle: false}
  return {duration: 250, stagger: 0, animateContainer: true, containerStyle: false}
}
