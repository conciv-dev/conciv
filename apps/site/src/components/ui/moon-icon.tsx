import {m} from 'motion/react'
import {AnimatedSvg, type IconProps} from './animated-svg'

export default function MoonIcon(props: IconProps) {
  return (
    <AnimatedSvg
      {...props}
      start={(animate) =>
        animate('.moon', {rotate: [0, -15, 0], scale: [1, 1.1, 1]}, {duration: 0.5, ease: 'easeInOut'})
      }
      stop={(animate) => animate('.moon', {rotate: 0, scale: 1}, {duration: 0.2, ease: 'easeOut'})}
    >
      <m.path
        className="moon"
        d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"
        style={{transformOrigin: 'center'}}
      />
    </AnimatedSvg>
  )
}
