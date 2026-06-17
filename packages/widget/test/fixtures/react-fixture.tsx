// A tiny REAL React app, bundled by esbuild and rendered into the IT page so bippy sees genuine
// fibers (and React's dev reconciler exposes the override methods). Exercises the cases that broke
// the old serializer: a function prop, a nested object, an array, a useState hook, and a class
// component with state.
import {Component, createContext, useState} from 'react'
import {createRoot} from 'react-dom/client'

const ThemeContext = createContext('light')

type CardProps = {label: string; onAction: () => void; meta: {nested: {deep: number}}; tags: string[]}

function Card(props: CardProps) {
  const [count, setCount] = useState(7)
  return (
    <div id="card" data-aidx-source="src/fixture.tsx:12:5">
      <span id="card-label">{props.label}</span>
      <span id="card-count">count: {count}</span>
      <button id="card-inc" onClick={() => setCount((c) => c + 1)}>
        inc
      </button>
      <button id="card-action" onClick={props.onAction}>
        action
      </button>
    </div>
  )
}

class ClassCard extends Component<{title: string}, {n: number}> {
  state = {n: 1}
  render() {
    return (
      <div id="class-card">
        <span id="class-title">{this.props.title}</span>
        <span id="class-n">n: {this.state.n}</span>
      </div>
    )
  }
}

class ContextCard extends Component {
  static contextType = ThemeContext
  declare context: string
  render() {
    return (
      <div id="context-card">
        <span id="context-theme">theme: {this.context}</span>
      </div>
    )
  }
}

const host = document.getElementById('react-root')
if (host) {
  createRoot(host).render(
    <div id="app-root">
      <Card label="Save" onAction={() => {}} meta={{nested: {deep: 42}}} tags={['a', 'b', 'c']} />
      <ClassCard title="Hello" />
      <ThemeContext.Provider value="dark">
        <ContextCard />
      </ThemeContext.Provider>
    </div>,
  )
}
