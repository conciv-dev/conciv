import type {Preview} from 'storybook-solidjs-vite'
import {trackFocusVisible} from '@zag-js/focus-visible'
import './storybook.css'

trackFocusVisible()

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
          padding: '24px',
          'max-width': '440px',
        }}
      >
        <Story />
      </div>
    ),
  ],
}

export default preview
