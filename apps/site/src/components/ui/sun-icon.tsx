import {m} from 'motion/react'
import {AnimatedSvg, type IconProps} from './animated-svg'

const RAYS = [
  'M12 2v2',
  'M12 20v2',
  'm4.93 4.93 1.41 1.41',
  'm17.66 17.66 1.41 1.41',
  'M2 12h2',
  'M20 12h2',
  'm6.34 17.66-1.41 1.41',
  'm19.07 4.93-1.41 1.41',
]

export default function SunIcon(props: IconProps) {
  return (
    <AnimatedSvg
      {...props}
      start={(animate) => {
        animate('.sun-core', {scale: [1, 0.85, 1]}, {duration: 0.5, ease: 'easeInOut'})
        animate('.sun-rays', {rotate: [0, 90]}, {duration: 0.6, ease: 'easeInOut'})
      }}
      stop={(animate) => {
        animate('.sun-core', {scale: 1}, {duration: 0.2, ease: 'easeOut'})
        animate('.sun-rays', {rotate: 0}, {duration: 0.2, ease: 'easeOut'})
      }}
    >
      <m.circle className="sun-core" cx="12" cy="12" r="4" style={{transformOrigin: 'center'}} />
      <m.g className="sun-rays" style={{transformOrigin: 'center'}}>
        {RAYS.map((d) => (
          <path key={d} d={d} />
        ))}
      </m.g>
    </AnimatedSvg>
  )
}
