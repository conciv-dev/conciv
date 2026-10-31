export function Table() {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Invoice</th>
          <th>Customer</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>INV-001</td>
          <td>Acme</td>
          <td>1,200</td>
        </tr>
        <tr>
          <td>INV-002</td>
          <td>Globex</td>
          <td>860</td>
        </tr>
      </tbody>
    </table>
  )
}
