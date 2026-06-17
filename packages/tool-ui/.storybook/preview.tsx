import type {Preview} from 'storybook-solidjs-vite'
import '../src/tokens.css'
import '../src/tool-ui.css'

// Stories render against the aidx dark panel so cards look exactly as they do in the widget.
const preview: Preview = {
  parameters: {
    controls: {matchers: {color: /(background|color)$/i, date: /Date$/i}},
    a11y: {test: 'todo'},
    backgrounds: {default: 'panel', values: [{name: 'panel', value: '#0f1115'}]},
  },
  decorators: [
    (Story) => (
      <div style={{background: 'var(--pw-panel)', padding: '20px', 'max-width': '420px'}}>
        <Story />
      </div>
    ),
  ],
}

export default preview
