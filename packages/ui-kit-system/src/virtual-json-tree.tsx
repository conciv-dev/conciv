import {For, Show, createMemo, mergeProps, splitProps, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {TreeView, useTreeViewNodeContext} from '@ark-ui/solid/tree-view'
import {JsonTreeView, useJsonTreeView} from '@ark-ui/solid/json-tree-view'
import {createVirtualizer} from '@tanstack/solid-virtual'
import {getAccessibleDescription, jsonNodeToElement, keyPathToKey} from '@zag-js/json-tree-utils'
import type {JsonNode, JsonNodeHastElement, JsonNodePreviewOptions} from '@zag-js/json-tree-utils'

const ROW_HEIGHT = 20
const OVERSCAN = 10
const SCOPE = {'data-scope': 'json-tree-view'}

type JsonTreeOptions = Partial<JsonNodePreviewOptions>

export type VirtualJsonTreeProps = {
  data: unknown
  class?: string
  arrow?: JSX.Element
  defaultExpandedDepth?: number
  maxPreviewItems?: number
  collapseStringsAfterLength?: number
  groupArraysAfterLength?: number
}

function rowStyle(row: {size: number; start: number}): JSX.CSSProperties {
  return {
    position: 'absolute',
    'inset-block-start': '0',
    'inset-inline-start': '0',
    'inline-size': '100%',
    'block-size': `${row.size}px`,
    transform: `translateY(${row.start}px)`,
  }
}

function JsonValue(props: {element: JsonNodeHastElement}): JSX.Element {
  const asElement = () => (props.element.type === 'element' ? props.element : undefined)
  const asText = () => (props.element.type === 'text' ? props.element.value : undefined)
  return (
    <Show when={asElement()} fallback={<>{asText()}</>}>
      {(element) => (
        <Dynamic
          component={element().tagName}
          data-root={element().properties.root ? '' : undefined}
          data-type={element().properties.nodeType}
          data-kind={element().properties.kind}
        >
          <For each={element().children}>{(child) => <JsonValue element={child} />}</For>
        </Dynamic>
      )}
    </Show>
  )
}

function JsonLabel(props: {node: JsonNode; options: JsonTreeOptions}): JSX.Element {
  const key = () => keyPathToKey(props.node.keyPath, {excludeRoot: true})
  return (
    <>
      <Show when={key()}>
        {(text) => (
          <>
            <span data-kind="key" data-non-enumerable={props.node.isNonEnumerable ? '' : undefined}>
              {text()}
            </span>
            <span data-kind="colon">: </span>
          </>
        )}
      </Show>
      <JsonValue element={jsonNodeToElement(props.node, props.options)} />
    </>
  )
}

function JsonRow(props: {node: JsonNode; arrow?: JSX.Element; options: JsonTreeOptions}): JSX.Element {
  const nodeState = useTreeViewNodeContext()
  const description = () => getAccessibleDescription(props.node)
  return (
    <Show
      when={nodeState().isBranch}
      fallback={
        <TreeView.Item {...SCOPE} aria-label={description()}>
          <TreeView.ItemText {...SCOPE}>
            <JsonLabel node={props.node} options={props.options} />
          </TreeView.ItemText>
        </TreeView.Item>
      }
    >
      <TreeView.Branch {...SCOPE}>
        <TreeView.BranchControl {...SCOPE} aria-label={description()}>
          <Show when={props.arrow}>
            <TreeView.BranchIndicator {...SCOPE}>{props.arrow}</TreeView.BranchIndicator>
          </Show>
          <TreeView.BranchText {...SCOPE}>
            <JsonLabel node={props.node} options={props.options} />
          </TreeView.BranchText>
        </TreeView.BranchControl>
      </TreeView.Branch>
    </Show>
  )
}

export function VirtualJsonTree(props: VirtualJsonTreeProps): JSX.Element {
  const [local, treeProps] = splitProps(props, ['class', 'arrow'])
  let scrollBox: HTMLDivElement | undefined
  let scrollToRow: ((index: number) => void) | undefined
  const treeOptions = mergeProps(treeProps, {
    scrollToIndexFn: (details: {index: number}) => scrollToRow?.(details.index),
  })
  const tree = useJsonTreeView(treeOptions)
  const visibleNodes = createMemo(() => tree().getVisibleNodes())
  const rowCount = createMemo(() => visibleNodes().length)
  const options = createMemo<JsonTreeOptions>(() => ({
    maxPreviewItems: props.maxPreviewItems,
    collapseStringsAfterLength: props.collapseStringsAfterLength,
    groupArraysAfterLength: props.groupArraysAfterLength,
  }))
  const virtualizer = createVirtualizer({
    get count() {
      return rowCount()
    },
    getScrollElement: () => scrollBox ?? null,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  })
  scrollToRow = (index) => virtualizer.scrollToIndex(index, {align: 'auto'})
  return (
    <JsonTreeView.RootProvider value={tree}>
      <TreeView.Tree
        {...SCOPE}
        ref={(element: HTMLDivElement) => {
          scrollBox = element
        }}
        class={local.class}
      >
        <div role="presentation" style={{position: 'relative', 'min-block-size': `${virtualizer.getTotalSize()}px`}}>
          <For each={virtualizer.getVirtualItems()}>
            {(row) => (
              <Show when={visibleNodes()[row.index]}>
                {(visible) => {
                  const node = createMemo(() => visible().node)
                  const indexPath = createMemo(() => visible().indexPath, undefined, {
                    equals: (previous, next) => previous.join() === next.join(),
                  })
                  return (
                    <div role="presentation" style={rowStyle(row)}>
                      <TreeView.NodeProvider node={node()} indexPath={indexPath()}>
                        <JsonRow node={node()} arrow={local.arrow} options={options()} />
                      </TreeView.NodeProvider>
                    </div>
                  )
                }}
              </Show>
            )}
          </For>
        </div>
      </TreeView.Tree>
    </JsonTreeView.RootProvider>
  )
}
