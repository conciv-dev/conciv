import type {PlaygroundScript} from '../../script'

export default {
  title: 'Allow a change once',
  screen: 'panel',
  plugins: [],
  turns: [
    {
      prompt: 'Reset the counter and keep it in the source.',
      replies: [
        {
          kind: 'tool',
          name: 'edit_file',
          input: {path: 'src/App.tsx', find: 'useState(5)', replace: 'useState(0)'},
          result: {ok: true, path: 'src/App.tsx'},
          ask: {title: 'edit_file src/App.tsx', always: true, answer: 'Allow once'},
          page: {count: 0},
        },
        {kind: 'text', text: 'You allowed that edit once. The next edit asks again.'},
      ],
    },
  ],
} satisfies PlaygroundScript
