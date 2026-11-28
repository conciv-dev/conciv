import type {PlaygroundScript} from '../../script'

export default {
  title: 'A command from the quick terminal',
  screen: 'quick',
  plugins: [],
  turns: [
    {
      prompt: 'Click the counter three times.',
      replies: [
        {kind: 'tool', name: 'page_click', input: {selector: 'button.counter'}, result: {ok: true}, page: {count: 1}},
        {kind: 'tool', name: 'page_click', input: {selector: 'button.counter'}, result: {ok: true}, page: {count: 2}},
        {kind: 'tool', name: 'page_click', input: {selector: 'button.counter'}, result: {ok: true}, page: {count: 3}},
        {
          kind: 'text',
          text: 'Clicked three times. The button reads **Count is 3**, and your app stayed usable below the sheet.',
        },
      ],
    },
  ],
} satisfies PlaygroundScript
