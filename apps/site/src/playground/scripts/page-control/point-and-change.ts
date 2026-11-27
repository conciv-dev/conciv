import type {PlaygroundScript} from '../../script'

export default {
  title: 'Point at an element and change it',
  screen: 'panel',
  plugins: [],
  turns: [
    {
      before: [
        {kind: 'click', role: 'button', label: 'More composer actions'},
        {kind: 'click', role: 'menuitem', label: 'Select an element from the page'},
        {kind: 'point', role: 'heading', label: 'Get started'},
      ],
      prompt: 'Make this heading say Welcome.',
      replies: [
        {
          kind: 'tool',
          name: 'page_locate',
          input: {selector: 'h1'},
          result: {name: 'App', file: 'src/App.tsx', line: 19},
        },
        {
          kind: 'tool',
          name: 'page_settext',
          input: {selector: 'h1', text: 'Welcome'},
          result: {ok: true},
          page: {heading: 'Welcome'},
        },
        {
          kind: 'text',
          text: 'The heading says **Welcome** now. It is a live change: ask me to keep it and I will edit `src/App.tsx` line 19.',
        },
      ],
    },
  ],
} satisfies PlaygroundScript
