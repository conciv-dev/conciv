import {type FormEvent, type JSX, useState} from 'react'
import './styles.css'

// A small but real host page: a counter, a contact form, and a feature list — enough live DOM
// for the devgent agent to inspect (page snapshot / query) and change (edit the source, then
// the page hot-reloads) when you chat with it via the injected widget.

const PLANS = ['Free', 'Pro', 'Enterprise']

function Counter(): JSX.Element {
  const [count, setCount] = useState(0)
  return (
    <section className="card">
      <h2>Counter</h2>
      <p className="count" aria-live="polite">
        {count}
      </p>
      <div className="row">
        <button onClick={() => setCount((c) => c - 1)}>−1</button>
        <button onClick={() => setCount((c) => c + 1)}>+1</button>
        <button onClick={() => setCount(0)}>Reset</button>
      </div>
    </section>
  )
}

function ContactForm(): JSX.Element {
  const [name, setName] = useState('')
  const [plan, setPlan] = useState(PLANS[0])
  const [submitted, setSubmitted] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(`${name || 'anonymous'} → ${plan}`)
  }
  return (
    <section className="card">
      <h2>Sign up</h2>
      <form onSubmit={submit}>
        <label>
          Name
          <input type="text" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="Ada Lovelace" />
        </label>
        <label>
          Plan
          <select value={plan} onChange={(e) => setPlan(e.currentTarget.value)}>
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Submit</button>
      </form>
      {submitted ? <p className="submitted">Submitted: {submitted}</p> : null}
    </section>
  )
}

const FEATURES = [
  'In-page chat agent (claude -p behind /__pw/*)',
  'Live page control — the agent reads and drives this DOM',
  'Out-of-process vitest runner with live result cards',
]

export function App(): JSX.Element {
  return (
    <main className="app">
      <header>
        <h1>devgent kitchen-sink</h1>
        <p className="lede">Click the ✦ button in the corner to chat with the dev agent.</p>
      </header>
      <Counter />
      <ContactForm />
      <section className="card">
        <h2>Features</h2>
        <ul>
          {FEATURES.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </section>
    </main>
  )
}
