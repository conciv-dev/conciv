import {Cards} from './Cards'
import {Table} from './Table'
import {Toolbar} from './Toolbar'

const TARGET_ALIASES = new Set(['badge', 'text-recolor'])

export function App() {
  const requested = new URLSearchParams(location.search).get('variant')
  const variant = requested !== null && TARGET_ALIASES.has(requested) ? 'target' : requested
  const labelColor = requested === 'text-recolor' ? '#ffd166' : undefined
  return (
    <>
      <Toolbar variant={variant} badge={requested === 'badge'} labelColor={labelColor} />
      <input id="field" className="field" placeholder="Search invoices" />
      <Cards variant={variant} />
      {variant === 'missing' ? null : <Table />}
    </>
  )
}
