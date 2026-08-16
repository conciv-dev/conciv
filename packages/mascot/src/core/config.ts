export type MascotState = 'rest' | 'awake'

export type FollowChannels = {eyes: boolean; antenna: boolean}

export type MascotFollow = boolean | FollowChannels

export type ActivityChannels = {bob: boolean; throb: boolean; blink: boolean}

export type MascotActivity = Partial<ActivityChannels>

export type MascotConfig = {
  state: MascotState
  working: boolean
  follow: MascotFollow
  activity?: MascotActivity
}

export const NO_FOLLOW_CHANNELS: FollowChannels = {eyes: false, antenna: false}

export const followChannels = (follow: MascotFollow): FollowChannels =>
  typeof follow === 'boolean' ? {eyes: follow, antenna: follow} : follow

export const sameFollowChannels = (left: FollowChannels, right: FollowChannels): boolean =>
  left.eyes === right.eyes && left.antenna === right.antenna

export const anyFollowChannel = (channels: FollowChannels): boolean => channels.eyes || channels.antenna

export const activityChannels = (activity: MascotActivity | undefined): ActivityChannels => ({
  bob: activity?.bob ?? true,
  throb: activity?.throb ?? true,
  blink: activity?.blink ?? true,
})

export const sameActivityChannels = (left: ActivityChannels, right: ActivityChannels): boolean =>
  left.bob === right.bob && left.throb === right.throb && left.blink === right.blink

const REDUCED_MOTION_QUERY =
  typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : undefined

export const reduceMotion = (): boolean => REDUCED_MOTION_QUERY?.matches === true

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
export const THROB_BEATS: readonly [number, number, number, number] = [0, 0.3, 1.15, 1.45]
export const THROB_RISE_DURATION_S = 0.3
export const THROB_RISE_EASE = 'power2.out'
export const THROB_RETURN_DURATION_S = 0.55
export const THROB_RETURN_EASE = 'elastic.out(1,0.5)'

export const HEAD_BOB_Y_PERCENT = -5
export const HEAD_BOB_DURATION_S = 1
export const HEAD_BOB_EASE = 'sine.inOut'
export const HEAD_BOB_BEATS: readonly [number, number] = [0, 1]

export const RECOVERY_DURATION_S = 0.2
export const RECOVERY_EASE = 'power2.out'

export const BLINK_CLOSE_SCALE_Y = 0.1
export const BLINK_CLOSE_DURATION_S = 0.07
export const BLINK_CLOSE_EASE = 'power2.in'
export const BLINK_OPEN_DURATION_S = 0.18
export const BLINK_OPEN_EASE = 'power2.out'
export const BLINK_BEATS: readonly [number, number] = [1.15, 1.22]

export const WORK_CYCLE_S = Math.max(
  HEAD_BOB_BEATS[1] + HEAD_BOB_DURATION_S,
  THROB_BEATS[3] + THROB_RETURN_DURATION_S,
  BLINK_BEATS[1] + BLINK_OPEN_DURATION_S,
)

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
export const BINARY_EMITTER_TANGENT_OFFSET_DEG = 90

export const TIP_SCALE = 0.2

export const ENTER_EASE = 'back.out(2.2)'
export const ENTER_DURATION_S = 0.36
export const EXIT_EASE = 'power2.in'
export const EXIT_DURATION_S = 0.5

export const REST_EYE_SCALE_Y = 1
export const REST_HEAD_Y_PERCENT = 0
