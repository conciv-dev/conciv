import type {Preview} from 'storybook-solidjs-vite'
import {withThemeByClassName} from '@storybook/addon-themes'
import {trackFocusVisible} from '@zag-js/focus-visible'
import './storybook.css'

trackFocusVisible()

const preview: Preview = {
  parameters: {
    controls: {matchers: {color: /(background|color)$/i, date: /Date$/i}},
    a11y: {test: 'todo'},
    backgrounds: {disable: true},
  },
  decorators: [
    withThemeByClassName({
      themes: {
        light: 'light',
        dark: 'dark',
        system: '',
        'light terminal': 'light chat-skin-terminal',
        'dark terminal': 'dark chat-skin-terminal',
        'system terminal': 'chat-skin-terminal',
      },
      defaultTheme: 'dark',
    }),
    (Story) => (
      <div
        style={{
          background: 'var(--chat-panel)',
          color: 'var(--chat-text)',
          'font-family': 'var(--chat-font)',
          padding: '24px',
          'max-width': '560px',
        }}
      >
        <Story />
      </div>
    ),
  ],
}

export default preview
