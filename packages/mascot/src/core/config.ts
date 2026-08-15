export type MascotState = 'rest' | 'awake'

export type MascotConfig = {state: MascotState; working: boolean; follow: boolean}

export const reduceMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export const ANTENNA_ORIGIN_FRACTION_X = 0.5
export const ANTENNA_ORIGIN_FRACTION_Y = 0.328

export const ANTENNA_TRANSFORM_ORIGIN = `${ANTENNA_ORIGIN_FRACTION_X * 100}% ${ANTENNA_ORIGIN_FRACTION_Y * 100}%`

export const GAZE_FALLOFF_PX = 220
export const GAZE_EYE_RANGE_PX = 3
export const GAZE_EYES_QUICK_TO_DURATION_S = 0.6
export const GAZE_EYES_QUICK_TO_EASE = 'power3.out'
export const GAZE_ANTENNA_LEAN_DEG = 10
export const GAZE_WRAPPER_QUICK_TO_DURATION_S = 0.5
export const GAZE_WRAPPER_QUICK_TO_EASE = 'power3.out'
export const GAZE_RETURN_DURATION_S = 0.25
export const GAZE_RETURN_EASE = 'power2.out'

export const THROB_SCALE_Y = 1.3
export const THROB_SCALE_X = 0.88
export const THROB_BEATS = [0, 0.3, 1.15, 1.45] as const
export const THROB_RISE_DURATION_S = 0.3
export const THROB_RISE_EASE = 'power2.out'
export const THROB_RETURN_DURATION_S = 0.55
export const THROB_RETURN_EASE = 'elastic.out(1,0.5)'

export const RECOVERY_DURATION_S = 0.2
export const RECOVERY_EASE = 'power2.out'

export const BLINK_CLOSE_SCALE_Y = 0.1
export const BLINK_CLOSE_DURATION_S = 0.07
export const BLINK_CLOSE_EASE = 'power2.in'
export const BLINK_OPEN_DURATION_S = 0.18
export const BLINK_OPEN_EASE = 'power2.out'
export const BLINK_BEATS = [1.15, 1.22] as const

export const EMITTER_REFERENCE_ANTENNA_PX = 44

export const BINARY_EMITTER_DIGIT_COUNT = 5
export const BINARY_EMITTER_LANE_OFFSET_PX = 3
export const BINARY_EMITTER_FONT_SIZE_PX = 9
export const BINARY_EMITTER_FONT_FAMILY = 'ui-monospace,SFMono-Regular,monospace'
export const BINARY_EMITTER_FONT_WEIGHT = 700
export const BINARY_EMITTER_RISE_PX = -54
export const BINARY_EMITTER_RISE_DURATION_S = 2.2
export const BINARY_EMITTER_STAGGER_S = 0.42
export const BINARY_EMITTER_COLOR = 'var(--pw-accent, #e0218a)'
export const BINARY_EMITTER_DIGIT_LEFT_PX = -4
export const BINARY_EMITTER_DIGIT_TOP_PX = -12

export const TIP_FRACTION_X = 0.5
export const TIP_FRACTION_Y = 0.15625
export const TIP_SCALE = 0.2
export const TIP_TRACK_DURATION_S = 0.45

export const ENTER_EASE = 'back.out(2.2)'
export const ENTER_DURATION_S = 0.36
export const EXIT_EASE = 'power2.in'
export const EXIT_DURATION_S = 0.5

export const REST_EYE_SCALE_Y = 1
export const AWAKE_EYE_REST_SCALE_Y = 1.06
