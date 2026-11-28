import {m} from 'motion/react'
import {AnimatedSvg, type IconProps} from './animated-svg'

export default function GithubIcon(props: IconProps) {
  return (
    <AnimatedSvg
      {...props}
      start={(animate) =>
        animate('.github-icon', {scale: [1, 1.1, 1], rotate: [0, -5, 5, 0]}, {duration: 0.5, ease: 'easeInOut'})
      }
      stop={(animate) => animate('.github-icon', {scale: 1, rotate: 0}, {duration: 0.2, ease: 'easeOut'})}
    >
      <m.g className="github-icon" style={{transformOrigin: 'center'}}>
        <path d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5" />
      </m.g>
    </AnimatedSvg>
  )
}
