import {Cards} from './Cards'
import {Table} from './Table'
import {Toolbar} from './Toolbar'

const TARGET_ALIASES = new Set([
  'badge',
  'text-recolor',
  'textnoise',
  'badge-textnoise',
  'text-changed',
  'field-border',
  'span-recolor',
])
const FIELD_BORDER = {borderColor: '#d64545', borderRadius: 0}

export function App() {
  const requested = new URLSearchParams(location.search).get('variant')
  const variant = requested !== null && TARGET_ALIASES.has(requested) ? 'target' : requested
  const labelColor = requested === 'text-recolor' ? '#ffd166' : undefined
  const label = requested === 'text-changed' ? 'Download' : 'Export'
  const badge = requested === 'badge' || requested === 'badge-textnoise'
  const textNoise = requested === 'textnoise' || requested === 'badge-textnoise'
  const spanColor = requested === 'span-recolor' ? '#ffd166' : undefined
  return (
    <>
      <Toolbar
        variant={variant}
        badge={badge}
        labelColor={labelColor}
        textNoise={textNoise}
        label={label}
        spanColor={spanColor}
      />
      <input
        id="field"
        className="field"
        placeholder="Search invoices"
        style={requested === 'field-border' ? FIELD_BORDER : undefined}
      />
      <Cards variant={variant} />
      {variant === 'missing' ? null : <Table />}
    </>
  )
}
