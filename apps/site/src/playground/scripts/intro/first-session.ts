import type {PlaygroundScript} from '../../script'

export default {
  title: 'A first session',
  screen: 'panel',
  plugins: [],
  turns: [
    {
      prompt: 'What is on this page?',
      replies: [
        {
          kind: 'tool',
          name: 'page_text',
          input: {selector: 'main'},
          result: {
            text: 'Get started. Edit src/App.tsx and save to test HMR. Count is 0. Documentation. Connect with us.',
          },
        },
        {
          kind: 'text',
          text: 'This is the Vite + React starter page. It has a **Get started** heading, a counter button at 0, and links to the Vite docs and community.',
        },
      ],
    },
    {
      prompt: 'Start the counter at 5.',
      replies: [
        {
          kind: 'tool',
          name: 'page_settext',
          input: {selector: 'button.counter', text: 'Count is 5'},
          result: {ok: true},
          page: {count: 5},
        },
        {
          kind: 'text',
          text: 'The button now reads **Count is 5**. To keep it, change `useState(0)` to `useState(5)` in `src/App.tsx`.',
        },
      ],
    },
  ],
} satisfies PlaygroundScript
