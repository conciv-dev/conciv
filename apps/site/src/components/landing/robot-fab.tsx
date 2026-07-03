import {createFabRobotRig, robotLayers, type FabRobotRig} from '@conciv/mascot'
import {useRef, useState, type CSSProperties} from 'react'

const LAYER: CSSProperties = {
  position: 'absolute',
  inset: 6,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'center',
  backgroundSize: 'contain',
  imageRendering: 'pixelated',
  willChange: 'transform',
}

type LayerKey = 'head' | 'eyes' | 'antenna'

export function RobotFab() {
  const layers = useRef<Partial<Record<LayerKey, HTMLElement>>>({})
  const rig = useRef<FabRobotRig | null>(null)
  const [working, setWorking] = useState(false)

  const attach = (key: LayerKey) => (el: HTMLSpanElement | null) => {
    layers.current[key] = el ?? undefined
    const {head, eyes, antenna} = layers.current
    if (el && head && eyes && antenna && !rig.current) {
      rig.current = createFabRobotRig({head, eyes, antenna})
      return
    }
    if (!el) {
      rig.current?.destroy()
      rig.current = null
    }
  }

  const enter = () => rig.current?.apply(working ? 'work' : 'open')
  const leave = () => rig.current?.apply(working ? 'work' : 'closed')

  const toggle = () => {
    const next = !working
    setWorking(next)
    rig.current?.apply(next ? 'work' : 'open')
  }

  return (
    <button
      type="button"
      onMouseEnter={enter}
      onMouseLeave={leave}
      onClick={toggle}
      aria-label={working ? 'Stop the robot thinking' : 'Make the robot think'}
      className="relative size-14 cursor-pointer rounded-full border bg-card shadow-[0_10px_24px_-12px_oklch(0.23_0.012_65/0.5)] transition-shadow hover:shadow-[0_12px_28px_-12px_oklch(0.23_0.012_65/0.65)]"
    >
      <span aria-hidden style={{...LAYER, backgroundImage: `url('${robotLayers.head}')`}} ref={attach('head')} />
      <span aria-hidden style={{...LAYER, backgroundImage: `url('${robotLayers.antenna}')`}} ref={attach('antenna')} />
      <span aria-hidden style={{...LAYER, backgroundImage: `url('${robotLayers.eyes}')`}} ref={attach('eyes')} />
    </button>
  )
}
