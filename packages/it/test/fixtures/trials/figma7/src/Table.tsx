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
    <table className={LOOKS[props.look ?? ''] ?? 'table'} data-conciv-key="bm5fsA">
      <thead data-conciv-key="_TyuRg">
        <tr data-conciv-key="RDcwpQ">
          <th data-conciv-key="FlCZfA">Invoice</th>
          <th data-conciv-key="Seu6AQ">Customer</th>
          <th data-conciv-key="NLA_Qw">Amount</th>
        </tr>
      </thead>
      <tbody data-conciv-key="k-NgUw">
        {rows.map((row, index) => (
          <tr key={row.invoice} data-conciv-key="5J5A1Q">
            <td data-conciv-key="KPiLdg">{row.invoice}</td>
            <td data-conciv-key="F7T8Sw">{row.customer}</td>
            {hardcoded && index === 0 ? <td data-conciv-key="cf_Y-Q">1,200</td> : <td data-conciv-key="r1zbYA">{row.amount}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
