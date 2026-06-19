import type {Preview} from 'storybook-solidjs-vite'
import '../src/storybook.css'

// Stories render against the mandarax dark panel so cards look exactly as they do in the widget.
const preview: Preview = {
  parameters: {
    controls: {matchers: {color: /(background|color)$/i, date: /Date$/i}},
    a11y: {test: 'todo'},
    backgrounds: {default: 'panel', values: [{name: 'panel', value: '#0f1115'}]},
  },
  decorators: [
    // Mirror the widget's :host base (font + text color) so stories render in system-ui, not the
    // browser default serif. The widget sets these on :host; Storybook has no shadow host, so set
    // them on the wrapper.
    (Story) => (
      <div
        style={{
          background: 'var(--pw-panel)',
          color: 'var(--pw-text)',
          'font-family': 'var(--pw-font)',
          padding: '20px',
          'max-width': '420px',
        }}
      >
        <Story />
      </div>
    ),
  ],
}

export default preview
