import type {ReactElement} from 'react'

const WIDTH = 1200
const HEIGHT = 630
const PAPER = '#faf8f1'
const INK = '#2b2420'
const MUTED = '#7a6f65'
const ACCENT = '#e0432a'

type OgTreeProps = {
  title: string
  description: string
}

export function buildOgTree(props: OgTreeProps): ReactElement {
  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: 'flex',
        position: 'relative',
        color: INK,
        'font-family': 'Bricolage Grotesque',
        'background-color': PAPER,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 64,
          top: 56,
          display: 'flex',
          'font-size': 32,
          'font-weight': 700,
          color: ACCENT,
          'letter-spacing': '-1px',
        }}
      >
        conciv
      </div>
      <div
        style={{
          position: 'absolute',
          left: 64,
          right: 64,
          top: 180,
          bottom: 64,
          display: 'flex',
          'flex-direction': 'column',
          'justify-content': 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            'font-size': 56,
            'font-weight': 700,
            'line-height': 1.08,
            'letter-spacing': '-1.5px',
            'margin-bottom': 20,
            'max-width': 1000,
          }}
        >
          {props.title}
        </div>
        <div
          style={{
            display: 'flex',
            'font-size': 28,
            'font-weight': 400,
            'line-height': 1.35,
            color: MUTED,
            'max-width': 980,
          }}
        >
          {props.description}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 12,
          'background-color': ACCENT,
        }}
      />
    </div>
  )
}
