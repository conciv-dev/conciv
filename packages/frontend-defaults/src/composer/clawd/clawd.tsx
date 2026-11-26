import {For, type JSX} from 'solid-js'

const PALETTE = {ink: '#2B2233', clay: '#D97757', clayDark: '#A84D33'}
const STROKE = 0.45
const VIEW_BOX = '-7.4 -8.5 14.8 8.75'
const BODY = {x: -5, y: -8, width: 10, height: 6}
const EYE = {offset: 2.5, y: -7, width: 1, height: 2}
const LEG = {top: -2.4, width: 1, height: 2.2}
const ARM = {pivotX: 4.9, pivotY: -4.5, length: 2.2, thickness: 1, raiseDegrees: 8.594}
const FRONT_LEGS = [-4, -2, 1, 3]

export function Clawd(props: {class?: string}): JSX.Element {
  return (
    <svg class={props.class} viewBox={VIEW_BOX} aria-hidden="true">
      <rect
        transform={`translate(${-ARM.pivotX} ${ARM.pivotY}) rotate(${ARM.raiseDegrees})`}
        x={-ARM.length}
        y={-ARM.thickness / 2}
        width={ARM.length}
        height={ARM.thickness}
        fill={PALETTE.clay}
        stroke={PALETTE.ink}
        stroke-width={STROKE}
      />
      <rect
        transform={`translate(${ARM.pivotX} ${ARM.pivotY}) rotate(${-ARM.raiseDegrees})`}
        x={0}
        y={-ARM.thickness / 2}
        width={ARM.length}
        height={ARM.thickness}
        fill={PALETTE.clay}
        stroke={PALETTE.ink}
        stroke-width={STROKE}
      />
      <For each={FRONT_LEGS}>
        {(x) => (
          <rect
            x={x}
            y={LEG.top}
            width={LEG.width}
            height={LEG.height}
            fill={PALETTE.clayDark}
            stroke={PALETTE.ink}
            stroke-width={STROKE}
          />
        )}
      </For>
      <rect {...BODY} fill={PALETTE.clay} stroke={PALETTE.ink} stroke-width={STROKE} />
      <For each={[-EYE.offset, EYE.offset]}>
        {(x) => <rect x={x - EYE.width / 2} y={EYE.y} width={EYE.width} height={EYE.height} fill={PALETTE.ink} />}
      </For>
    </svg>
  )
}
