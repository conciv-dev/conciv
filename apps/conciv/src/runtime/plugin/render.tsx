import {
  createMemo,
  ErrorBoundary,
  For,
  getOwner,
  onMount,
  runWithOwner,
  Show,
  untrack,
  type Component,
  type JSX,
  type ParentProps,
} from 'solid-js'
import {render} from 'solid-js/web'
import {
  MarkdownProvider,
  type MarkdownCodeAction,
  type MarkdownCodeBlock,
  type MarkdownCodeBlocks,
} from '@conciv/ui-kit-chat'
import {
  CodeBlock,
  CodeBlockAction,
  LinkHandler,
  Slot,
  type CodeBlockProps,
  type MountedSession,
  type SlotMap,
} from '@conciv/plugin/experimental'
import {PluginContext} from '@conciv/plugin/experimental/host'
import {usePluginHost, type Item} from './host'
import {createLinkCheck} from './link-check'

export function Contribution(props: {plugin: string; failed?: () => void; children: () => JSX.Element}) {
  const host = usePluginHost()

  return (
    <Show when={host.context(props.plugin)} keyed>
      {(context) => (
        <ErrorBoundary
          fallback={(error) => {
            onMount(() => {
              host.fail(props.plugin, error)
              props.failed?.()
            })

            return null
          }}
        >
          <PluginContext.Provider value={context}>{untrack(props.children)}</PluginContext.Provider>
        </ErrorBoundary>
      )}
    </Show>
  )
}

export function PluginSlot<At extends keyof SlotMap>(props: {at: At; input: SlotMap[At]; fallback?: JSX.Element}) {
  const host = usePluginHost()

  const items = createMemo(() =>
    host
      .items(Slot)
      .filter((item) => item.value.at === props.at)
      .toSorted((a, b) => (a.value.order ?? 0) - (b.value.order ?? 0)),
  )

  return (
    <For each={items()} fallback={props.fallback}>
      {(item) => (
        <Contribution plugin={item.plugin}>
          {() => (item.value.render as (input: SlotMap[At]) => JSX.Element)(props.input)}
        </Contribution>
      )}
    </For>
  )
}

export function PluginLinks(props: ParentProps<{session: MountedSession | undefined; active?: boolean}>) {
  const host = usePluginHost()
  const handled = createMemo(() => props.session !== undefined && host.items(LinkHandler).length > 0)

  const localFileExists = createLinkCheck(
    () => props.active !== false,
    (href) => {
      const session = props.session

      return session ? host.links.exists({href, session}) : false
    },
  )

  const openLocalFile = (href: string) => {
    const session = props.session

    if (session) host.links.open({href, session})
  }

  const Links = (inner: ParentProps<{codeBlocks: MarkdownCodeBlocks | false}>) => (
    <MarkdownProvider
      openLocalFile={handled() ? openLocalFile : undefined}
      localFileExists={handled() ? localFileExists : undefined}
      codeBlocks={inner.codeBlocks}
    >
      {inner.children}
    </MarkdownProvider>
  )

  const codeBlocks = createCodeBlocks(() => props.session, Links)

  return <Links codeBlocks={codeBlocks}>{props.children}</Links>
}

const NO_CODE_BLOCKS = {
  renderers: new Map<string, Item<CodeBlock>>(),
  items: [],
  render: new Set<string>(),
  actions: new Set<string>(),
}

function createCodeBlocks(
  session: () => MountedSession | undefined,
  Provider: Component<ParentProps<{codeBlocks: false}>>,
): MarkdownCodeBlocks {
  const host = usePluginHost()
  const owner = getOwner()
  const wrapped = new WeakMap<Item<CodeBlockAction>, MarkdownCodeAction>()

  const current = createMemo(
    () => {
      if (!session()) return NO_CODE_BLOCKS
      const renderers = new Map<string, Item<CodeBlock>>()
      host.items(CodeBlock).forEach((item) =>
        item.value.languages.forEach((language) => {
          const key = language.toLowerCase()

          if (!renderers.has(key)) renderers.set(key, item)
        }),
      )
      const actions = host.items(CodeBlockAction).toSorted((a, b) => (a.value.order ?? 0) - (b.value.order ?? 0))

      return {
        renderers,
        items: actions,
        render: new Set(renderers.keys()),
        actions: new Set(actions.flatMap((item) => item.value.languages.map((language) => language.toLowerCase()))),
      }
    },
    undefined,
    {
      equals: (a, b) =>
        a.items.length === b.items.length &&
        a.items.every((item, index) => item === b.items[index]) &&
        a.renderers.size === b.renderers.size &&
        [...a.renderers].every(([language, item]) => b.renderers.get(language) === item),
    },
  )

  const input = (block: MarkdownCodeBlock, view: MountedSession): CodeBlockProps => ({
    code: block.code,
    language: block.language,
    get session() {
      return session() ?? view
    },
  })

  const action = (item: Item<CodeBlockAction>) => {
    const known = wrapped.get(item)

    if (known) return known

    const next: MarkdownCodeAction = {
      get icon() {
        return item.value.icon
      },
      get title() {
        return item.value.title
      },
      run: (block) => {
        const view = untrack(session)

        if (!view) return
        void Promise.try(() => item.value.run(input(block, view))).catch((cause: unknown) =>
          console.error(`[plugin] ${item.plugin}`, cause),
        )
      },
    }

    wrapped.set(item, next)

    return next
  }

  return {
    current,
    render(target, block, fallback) {
      const item = untrack(current).renderers.get(block.language)
      const view = untrack(session)

      if (!item || !view) return

      return runWithOwner(owner, () =>
        render(
          () => (
            <Provider codeBlocks={false}>
              <Contribution plugin={item.plugin} failed={fallback}>
                {() => {
                  const drawn = item.value.render(input(block, view))

                  if (drawn === undefined || drawn === null) queueMicrotask(fallback)

                  return drawn
                }}
              </Contribution>
            </Provider>
          ),
          target,
        ),
      )
    },
    actions: (language) =>
      current()
        .items.filter((item) => item.value.languages.some((name) => name.toLowerCase() === language))
        .map(action),
  }
}
