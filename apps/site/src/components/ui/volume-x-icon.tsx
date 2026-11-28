import {m} from 'motion/react'
import {AnimatedSvg, type IconProps} from './animated-svg'

export default function VolumeXIcon(props: IconProps) {
  return (
    <AnimatedSvg
      {...props}
      start={(animate) => {
        animate('.speaker', {x: [-1, 1, -1, 0]}, {duration: 0.3, ease: 'easeInOut'})
        animate('.x-mark', {scale: [1, 1.15, 1]}, {duration: 0.4, ease: 'easeOut', delay: 0.3})
      }}
      stop={(animate) => {
        animate('.speaker', {x: 0}, {duration: 0.2, ease: 'easeOut'})
        animate('.x-mark', {scale: 1}, {duration: 0.2, ease: 'easeOut'})
      }}
    >
      <m.path
        className="speaker"
        d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"
      />
      <m.g className="x-mark" style={{transformOrigin: '19px 12px'}}>
        <line x1="22" x2="16" y1="9" y2="15" />
        <line x1="16" x2="22" y1="9" y2="15" />
      </m.g>
    </AnimatedSvg>
  )
}
