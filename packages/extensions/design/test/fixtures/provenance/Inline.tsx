import type {CSSProperties} from 'react'

const BASE: CSSProperties = {
  display: 'flex',
}

function spreadOf(dense: boolean): CSSProperties {
  if (dense) return {...BASE, gap: 8}
  return BASE
}

type Props = {
  dense: boolean
  label: string
}

export function Inline(props: Props) {
  const spread = spreadOf(props.dense)
  return (
    <div style={{paddingLeft: 24, ...spread}}>
      <span>{props.label}</span>
    </div>
  )
}
