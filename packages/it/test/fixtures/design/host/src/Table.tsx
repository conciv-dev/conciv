type Row = {invoice: string; customer: string; amount: string}

const ROWS: Row[] = [
  {invoice: 'INV-001', customer: 'Acme', amount: '1,200'},
  {invoice: 'INV-002', customer: 'Globex', amount: '860'},
]
const ROLE_ROWS: Row[] = [...ROWS, {invoice: 'INV-003', customer: '[Customer Name]', amount: '$1,200'}]

const LOOKS: Record<string, string> = {bordered: 'table bordered', grid: 'table grid'}

export function Table(props: {variant: string | null; look?: string | null}) {
  const rows = props.variant === 'roles' ? ROLE_ROWS : ROWS
  const hardcoded = props.variant === 'hardcoded'
  return (
    <table className={LOOKS[props.look ?? ''] ?? 'table'}>
      <thead>
        <tr>
          <th>Invoice</th>
          <th>Customer</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={row.invoice}>
            <td>{row.invoice}</td>
            <td>{row.customer}</td>
            {hardcoded && index === 0 ? <td>1,200</td> : <td>{row.amount}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
