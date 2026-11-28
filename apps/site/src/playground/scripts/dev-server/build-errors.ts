import type {PlaygroundScript} from '../../script'

export default {
  title: 'Ask the dev server about a build error',
  screen: 'panel',
  plugins: [],
  turns: [
    {
      prompt: 'The hero image is missing. Does the dev server report an error?',
      replies: [
        {
          kind: 'tool',
          name: 'page_console',
          input: {},
          result: {
            entries: [
              {level: 'error', ts: 0, text: 'Failed to resolve import "./assets/hero.webp" from "src/App.tsx"'},
            ],
          },
        },
        {
          kind: 'tool',
          name: 'server_resolve',
          input: {spec: './assets/hero.webp', importer: 'src/App.tsx'},
          result: {id: null},
        },
        {
          kind: 'tool',
          name: 'server_resolve',
          input: {spec: './assets/hero.png', importer: 'src/App.tsx'},
          result: {id: '/workspace/src/assets/hero.png'},
        },
        {
          kind: 'text',
          text: 'The server cannot resolve `./assets/hero.webp`: that file does not exist. `./assets/hero.png` does. Change the import in `src/App.tsx` to `hero.png`.',
        },
      ],
    },
  ],
} satisfies PlaygroundScript
