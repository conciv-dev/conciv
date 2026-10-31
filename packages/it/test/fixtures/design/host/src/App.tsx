import {Cards} from './Cards'
import {Table} from './Table'
import {Toolbar} from './Toolbar'

export function App() {
  const requested = new URLSearchParams(location.search).get('variant')
  const variant = requested === 'badge' ? 'target' : requested
  return (
    <>
      <Toolbar variant={variant} badge={requested === 'badge'} />
      <input id="field" className="field" placeholder="Search invoices" />
      <Cards variant={variant} />
      {variant === 'missing' ? null : <Table />}
    </>
  )
}
