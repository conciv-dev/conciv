import type {PlaygroundScript} from '../../script'

export default {
  title: 'Send, then queue the next message',
  screen: 'panel',
  plugins: [],
  turns: [
    {
      prompt: 'Change the heading to Hello conciv.',
      replies: [
        {kind: 'thinking', text: 'The heading is the h1 in the center section. I will set its text.'},
        {
          kind: 'tool',
          name: 'page_settext',
          input: {selector: 'h1', text: 'Hello conciv'},
          result: {ok: true},
          page: {heading: 'Hello conciv'},
        },
        {kind: 'text', text: 'The heading now says **Hello conciv**.'},
      ],
    },
    {
      prompt: 'Then make the button say Clicks.',
      queued: true,
      replies: [
        {
          kind: 'tool',
          name: 'page_settext',
          input: {selector: 'button.counter', text: 'Clicks 0'},
          result: {ok: true},
          page: {button: 'Clicks'},
        },
        {kind: 'text', text: 'Done. Your queued message ran as soon as the first one finished.'},
      ],
    },
  ],
} satisfies PlaygroundScript
