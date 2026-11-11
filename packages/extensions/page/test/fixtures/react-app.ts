import {type ChangeEvent, Component, createContext, createElement, type ReactNode, useContext, useState} from 'react'

export const ThemeContext = createContext('light')

export function Leaf(props: {label: string}): ReactNode {
  const [count, setCount] = useState(0)
  const theme = useContext(ThemeContext)
  return createElement(
    'button',
    {'data-fixture': 'leaf', onClick: () => setCount(count + 1)},
    props.label,
    ':',
    count,
    ':',
    theme,
  )
}

export class Counter extends Component<{start: number}, {value: number}> {
  override state = {value: this.props.start}
  override render(): ReactNode {
    return createElement('output', {'data-fixture': 'class'}, this.state.value)
  }
}

export function ControlledForm(): ReactNode {
  const [subscribed, setSubscribed] = useState(false)
  const [plan, setPlan] = useState('none')
  return createElement(
    'form',
    null,
    createElement('label', {htmlFor: 'subscribe'}, 'subscribe'),
    createElement('input', {
      id: 'subscribe',
      type: 'checkbox',
      checked: subscribed,
      onChange: (event: ChangeEvent<HTMLInputElement>) => setSubscribed(event.target.checked),
    }),
    createElement('label', {htmlFor: 'plan-free'}, 'free'),
    createElement('input', {
      id: 'plan-free',
      type: 'radio',
      name: 'plan',
      checked: plan === 'free',
      onChange: () => setPlan('free'),
    }),
    createElement('label', {htmlFor: 'plan-pro'}, 'pro'),
    createElement('input', {
      id: 'plan-pro',
      type: 'radio',
      name: 'plan',
      checked: plan === 'pro',
      onChange: () => setPlan('pro'),
    }),
    createElement('p', null, 'subscribed: ', String(subscribed), ' plan: ', plan),
  )
}

function Branch(): ReactNode {
  return createElement('section', null, createElement(Leaf, {label: 'A'}), createElement(Counter, {start: 5}))
}

export function FixtureApp(): ReactNode {
  return createElement(
    ThemeContext.Provider,
    {value: 'dark'},
    createElement('main', {'data-fixture': 'root'}, createElement(Branch)),
  )
}
