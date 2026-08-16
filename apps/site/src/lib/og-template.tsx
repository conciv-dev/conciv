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
        fontFamily: 'Bricolage Grotesque',
        backgroundColor: PAPER,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 64,
          top: 56,
          display: 'flex',
          fontSize: 32,
          fontWeight: 700,
          color: ACCENT,
          letterSpacing: '-1px',
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
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: '-1.5px',
            marginBottom: 20,
            maxWidth: 1000,
          }}
        >
          {props.title}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 28,
            fontWeight: 400,
            lineHeight: 1.35,
            color: MUTED,
            maxWidth: 980,
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
          backgroundColor: ACCENT,
        }}
      />
    </div>
  )
}
