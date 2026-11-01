import {Cards} from './Cards'
import {Table} from './Table'
import {Toolbar} from './Toolbar'

const TARGET_ALIASES = new Set(['badge', 'text-recolor', 'textnoise', 'badge-textnoise'])

export function App() {
  const requested = new URLSearchParams(location.search).get('variant')
  const variant = requested !== null && TARGET_ALIASES.has(requested) ? 'target' : requested
  const labelColor = requested === 'text-recolor' ? '#ffd166' : undefined
  const badge = requested === 'badge' || requested === 'badge-textnoise'
  const textNoise = requested === 'textnoise' || requested === 'badge-textnoise'
  return (
    <>
      <Toolbar variant={variant} badge={badge} labelColor={labelColor} textNoise={textNoise} />
      <input id="field" className="field" placeholder="Search invoices" />
      <Cards variant={variant} />
      {variant === 'missing' ? null : <Table />}
    </>
  )
}
