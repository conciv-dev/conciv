export default function Panel() {
  return <button onClick={() => void import('./lazy-panel.js')}>Open the panel</button>
}
