import {Cards} from './Cards'
import {Table} from './Table'
import {Toolbar} from './Toolbar'

export function App() {
  const variant = new URLSearchParams(location.search).get('variant')
  return (
    <main className="app">
      <Toolbar variant={variant} />
      <input id="field" className="field" placeholder="Search invoices" />
      <Cards variant={variant} />
      {variant === 'missing' ? null : <Table />}
    </main>
  )
}
