import type {SVGProps} from 'react'

export const DEFAULT_STROKE_WIDTH = 2

export function scaledStrokeWidth(strokeWidth: number, viewBoxSize: number): number {
  return strokeWidth * (viewBoxSize / 24)
}

export interface AnimatedIconProps extends Omit<
  SVGProps<SVGSVGElement>,
  | 'ref'
  | 'onAnimationStart'
  | 'onAnimationEnd'
  | 'onAnimationIteration'
  | 'onDrag'
  | 'onDragEnd'
  | 'onDragEnter'
  | 'onDragExit'
  | 'onDragLeave'
  | 'onDragOver'
  | 'onDragStart'
  | 'onDrop'
  | 'values'
> {
  size?: number | string

  color?: string

  strokeWidth?: number

  className?: string
}

export interface AnimatedIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}
