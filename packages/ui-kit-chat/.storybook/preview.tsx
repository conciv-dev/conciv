import type {Preview} from 'storybook-solidjs-vite'
import './storybook.css'

// Stories render against the conciv dark panel so chat surfaces look exactly as in the widget.
const preview: Preview = {
  parameters: {
    controls: {matchers: {color: /(background|color)$/i, date: /Date$/i}},
    a11y: {test: 'todo'},
    backgrounds: {default: 'panel', values: [{name: 'panel', value: '#0f1115'}]},
  },
  decorators: [
    (Story) => (
      <div
        style={{
          background: 'var(--pw-panel)',
          color: 'var(--pw-text)',
          'font-family': 'var(--pw-font)',
          padding: '20px',
          'max-width': '460px',
        }}
      >
        <Story />
      </div>
    ),
  ],
}

export default preview
