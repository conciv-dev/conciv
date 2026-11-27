import type {PlaygroundScript} from '../../script'

export default {
  title: 'Your plugin draws its own card',
  screen: 'panel',
  plugins: ['project-version'],
  turns: [
    {
      prompt: 'Which version is this project?',
      replies: [
        {kind: 'tool', name: 'project_version', input: {}, result: {name: 'vite-project', version: '0.0.0'}},
        {kind: 'text', text: 'This is **vite-project 0.0.0**, read from `package.json`.'},
      ],
    },
  ],
} satisfies PlaygroundScript
