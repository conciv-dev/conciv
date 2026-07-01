import type {Preview} from 'storybook-solidjs-vite'
import '../src/storybook.css'

// Stories render against the conciv dark panel so widget UI looks exactly as it does mounted in the
// page. The widget sets its base (font + text color) on the shadow :host; Storybook has no shadow
// host, so the decorator sets them on the wrapper instead.
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
        }}
      >
        <Story />
      </div>
    ),
  ],
}

export default preview
