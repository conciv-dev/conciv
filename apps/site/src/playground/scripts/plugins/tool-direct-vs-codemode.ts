import type {PlaygroundScript} from '../../script'

const manifest = {name: 'vite-project', version: '0.0.0'}

export default {
  title: 'A tool called directly, then from code mode',
  screen: 'panel',
  plugins: ['project-version'],
  turns: [
    {
      prompt: 'Which version is this project?',
      replies: [
        {kind: 'tool', name: 'project_version', input: {}, result: manifest},
        {kind: 'text', text: 'Called directly: **vite-project 0.0.0**.'},
      ],
    },
    {
      prompt: 'Read it again from code mode.',
      replies: [
        {kind: 'tool', name: 'project_version', input: {}, result: manifest, mode: 'code'},
        {
          kind: 'text',
          text: 'Same answer. In code mode the call runs inside a TypeScript program, and its card sits inside the program card.',
        },
      ],
    },
  ],
} satisfies PlaygroundScript
