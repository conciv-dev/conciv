import {m} from 'motion/react'
import {AnimatedSvg, type IconProps} from './animated-svg'
import {scaledStrokeWidth} from './types'

export default function MagnifierIcon(props: IconProps) {
  return (
    <AnimatedSvg
      {...props}
      viewBox="0 0 32 32"
      strokeWidth={scaledStrokeWidth(2, 32)}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      strokeMiterlimit="10"
      start={(animate) =>
        animate(
          '.magnifier-group',
          {x: [0, 1, 0, -1, 0], y: [0, -1, -2, -1, 0], rotate: [0, -5, 5, -5, 0]},
          {duration: 1, ease: 'easeInOut'},
        )
      }
      stop={(animate) => animate('.magnifier-group', {x: 0, y: 0, rotate: 0}, {duration: 0.2, ease: 'easeOut'})}
    >
      <m.g className="magnifier-group" style={{transformOrigin: '13px 13px', transformBox: 'fill-box'}}>
        <path d="m21.393,18.565l7.021,7.021c.781.781.781,2.047,0,2.828h0c-.781.781-2.047.781-2.828,0l-7.021-7.021" />
        <circle cx="13" cy="13" r="10" strokeLinecap="square" />
      </m.g>
    </AnimatedSvg>
  )
}
