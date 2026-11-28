import type {PlaygroundScript} from '../../script'

export default {
  title: 'Your tool asks for permission',
  screen: 'panel',
  plugins: [],
  turns: [
    {
      prompt: 'Ship the release.',
      replies: [
        {
          kind: 'tool',
          name: 'release_ship',
          input: {version: '1.2.0'},
          result: {shipped: '1.2.0'},
          ask: {title: 'release_ship 1.2.0', answer: 'Allow once'},
        },
        {kind: 'text', text: 'Shipped **1.2.0**. The tool asked first, and ran only after you allowed it.'},
      ],
    },
  ],
} satisfies PlaygroundScript
