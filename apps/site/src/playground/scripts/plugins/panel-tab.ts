import type {PlaygroundScript} from '../../script'

export default {
  title: 'Your plugin adds a tab',
  screen: 'panel',
  plugins: ['shelf'],
  turns: [
    {
      prompt: 'Where do I find the shelf?',
      replies: [{kind: 'text', text: 'Your plugin added a **Shelf** tab to the pane. Here it is.'}],
      after: [{kind: 'click', role: 'tab', label: 'Shelf'}],
    },
  ],
} satisfies PlaygroundScript
