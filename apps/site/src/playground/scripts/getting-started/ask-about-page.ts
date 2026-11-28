import type {PlaygroundScript} from '../../script'

export default {
  title: 'Ask about the page',
  screen: 'panel',
  plugins: [],
  turns: [
    {
      prompt: 'What does the button on this page do?',
      replies: [
        {kind: 'tool', name: 'page_text', input: {selector: 'button'}, result: {text: 'Count is 0'}},
        {
          kind: 'tool',
          name: 'page_find',
          input: {name: 'App'},
          result: {matches: [{name: 'App', file: 'src/App.tsx', line: 7}]},
        },
        {
          kind: 'text',
          text: 'It is the counter from `src/App.tsx`. Each click calls `setCount`, so the label goes up by one: **Count is 1**, **Count is 2**, and so on.',
        },
      ],
    },
  ],
} satisfies PlaygroundScript
