import type {FakeBundle} from '@conciv/client/testing'
import {Command, ComposerPill, Plugin, Slot} from '@conciv/frontend-plugin-api'
import type {ShellPlugin} from './mount-shell.js'

type JsonOption = string | number | boolean

export function localBundle(
  id: string,
  code: string,
  options: {readonly server?: boolean; readonly options?: Readonly<Record<string, JsonOption>>} = {},
): FakeBundle {
  return {
    info: {
      id,
      source: {type: 'local', path: `conciv/plugins/${id}`},
      features: options.server === true ? {experimental: true, server: true} : {experimental: true},
      state: {status: 'active'},
    },
    experimental: async () => ({
      file: 'plugin-experimental.js',
      code,
      revision: id,
      options: {...options.options},
      chunks: [],
    }),
  }
}

function paragraph(text: string): HTMLParagraphElement {
  return Object.assign(document.createElement('p'), {textContent: text})
}

export const releaseTrainSlotsPlugin: ShellPlugin = {
  id: 'release-train',
  plugin: Plugin.define({
    setup(ctx) {
      ctx.add(Slot, {at: 'session.header', render: () => paragraph('Release train: on time')})
      ctx.add(Slot, {at: 'session.status', render: () => paragraph('Next train at noon')})
    },
  }),
}

function closeButton(close: () => void): HTMLButtonElement {
  const button = Object.assign(document.createElement('button'), {type: 'button', textContent: 'Done'})
  button.addEventListener('click', () => close())
  return button
}

export const reviewNotesPlugin: ShellPlugin = {
  id: 'review-notes',
  plugin: Plugin.define({
    setup(ctx) {
      ctx.add(Command, {
        id: 'review',
        title: 'Review',
        description: 'Review a part of the page',
        slash: {name: 'review', arguments: true},
        run: (input) => {
          ctx.toast.show({title: `Reviewing ${input}`, persistent: true})
        },
      })
      ctx.add(Command, {
        id: 'summary',
        title: 'Summary',
        description: 'Sum up the review',
        slash: {name: 'summary', after: 'model'},
        run: () => {
          ctx.toast.show({title: 'Summary ready', persistent: true})
        },
      })
      ctx.add(ComposerPill, {
        id: 'review',
        order: 3,
        show: (input) => ({
          label: 'Review',
          run: () => {
            input.screen.composer.attach({
              type: 'note',
              origin: 'review',
              commentId: 'header',
              label: 'Header',
              icon: 'message-square',
              subject: 'the page header',
              comment: 'Make the header sticky',
            })
            input.screen.composer.focus()
          },
        }),
      })
      ctx.add(ComposerPill, {
        id: 'checks',
        order: 1,
        show: (input) =>
          input.screen.composer.text() === ''
            ? {
                label: 'Checks',
                rows: [
                  {
                    id: 'lint',
                    label: 'Lint failed',
                    tone: 'danger',
                    run: () => input.screen.composer.insert('Fix lint'),
                  },
                ],
              }
            : undefined,
      })
      ctx.add(ComposerPill, {
        id: 'status',
        order: 2,
        show: () => ({label: 'Status', title: 'Deploy status'}),
        menu: (input) => {
          const content = document.createElement('div')
          content.append(
            Object.assign(document.createElement('p'), {textContent: 'Staging is green'}),
            closeButton(() => input.close()),
          )
          return content
        },
      })
    },
  }),
}
