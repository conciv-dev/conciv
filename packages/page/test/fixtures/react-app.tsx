import {Component, createContext, useContext, useState, type ReactNode} from 'react'

export const ThemeContext = createContext('light')

export function Leaf(props: {label: string}): ReactNode {
  const [count, setCount] = useState(0)
  const theme = useContext(ThemeContext)
  return (
    <button data-fixture="leaf" onClick={() => setCount(count + 1)}>
      {props.label}:{count}:{theme}
    </button>
  )
}

export class Counter extends Component<{start: number}, {value: number}> {
  state = {value: this.props.start}
  render(): ReactNode {
    return <output data-fixture="class">{this.state.value}</output>
  }
}

export function ControlledForm(): ReactNode {
  const [subscribed, setSubscribed] = useState(false)
  const [plan, setPlan] = useState('none')
  return (
    <form>
      <label htmlFor="subscribe">subscribe</label>
      <input id="subscribe" type="checkbox" checked={subscribed} onChange={(e) => setSubscribed(e.target.checked)} />
      <label htmlFor="plan-free">free</label>
      <input id="plan-free" type="radio" name="plan" checked={plan === 'free'} onChange={() => setPlan('free')} />
      <label htmlFor="plan-pro">pro</label>
      <input id="plan-pro" type="radio" name="plan" checked={plan === 'pro'} onChange={() => setPlan('pro')} />
      <p>
        subscribed: {String(subscribed)} plan: {plan}
      </p>
    </form>
  )
}

function Branch(): ReactNode {
  return (
    <section>
      <Leaf label="A" />
      <Counter start={5} />
    </section>
  )
}

export function FixtureApp(): ReactNode {
  return (
    <ThemeContext.Provider value="dark">
      <main data-fixture="root">
        <Branch />
      </main>
    </ThemeContext.Provider>
  )
}
