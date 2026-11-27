import {createContext, use, type ComponentProps, type ReactNode} from 'react'
import {
  CodeBlock,
  CodeBlockTab as FumadocsCodeBlockTab,
  CodeBlockTabs as FumadocsCodeBlockTabs,
  CodeBlockTabsList as FumadocsCodeBlockTabsList,
  Pre,
} from 'fumadocs-ui/components/codeblock'
import {TabsTrigger} from 'fumadocs-ui/components/ui/tabs'
import {PopupContent as TwoslashPopupContent, PopupTrigger as TwoslashPopupTrigger} from 'fumadocs-twoslash/ui'
import {cn} from '@/lib/utils'
import {SlidingTabs} from './docs-tabs'

const boxedCopy = '[&_button]:rounded-md [&_button]:border [&_button]:bg-fd-background [&_button]:shadow-xs'

function CopyActions({className, children}: {className?: string; children?: ReactNode}) {
  return <div className={cn('empty:hidden', boxedCopy, className)}>{children}</div>
}

function TabBarCopyActions({className, children}: {className?: string; children?: ReactNode}) {
  return (
    <div
      className={cn(
        'empty:hidden',
        boxedCopy,
        className,
        'static flex h-9.5 items-center justify-end rounded-none pe-2 backdrop-blur-none',
      )}
    >
      {children}
    </div>
  )
}

type CodeChrome = {
  plain: boolean
  figureClass?: string
  viewportClass?: string
  UntitledActions: typeof CopyActions
}

const pageChrome: CodeChrome = {plain: false, UntitledActions: CopyActions}
const tabChrome: CodeChrome = {
  plain: false,
  figureClass: 'contents [&_figcaption]:w-0 [&>div:first-child]:border-b-0',
  viewportClass: 'col-span-full border-t contain-inline-size',
  UntitledActions: TabBarCopyActions,
}
const popupChrome: CodeChrome = {plain: true, UntitledActions: CopyActions}

const CodeChromeContext = createContext(pageChrome)

export function CodeBlockPre(props: ComponentProps<'pre'>) {
  const chrome = use(CodeChromeContext)
  if (chrome.plain) return <pre {...props} />
  return (
    <CodeBlock
      {...props}
      className={cn(chrome.figureClass, props.className)}
      viewportProps={{className: chrome.viewportClass}}
      Actions={props.title ? CopyActions : chrome.UntitledActions}
    >
      <Pre>{props.children}</Pre>
    </CodeBlock>
  )
}

export function CodeBlockTabs(props: ComponentProps<typeof FumadocsCodeBlockTabs>) {
  return (
    <CodeChromeContext value={tabChrome}>
      <SlidingTabs>
        <FumadocsCodeBlockTabs
          {...props}
          className={cn(
            'grid grid-cols-[minmax(0,auto)_minmax(min-content,1fr)] overflow-hidden contain-inline-size',
            props.className,
          )}
        />
      </SlidingTabs>
    </CodeChromeContext>
  )
}

export function CodeBlockTabsList(props: ComponentProps<typeof FumadocsCodeBlockTabsList>) {
  return (
    <FumadocsCodeBlockTabsList
      {...props}
      className={cn(
        'col-start-1 row-start-1 pe-6 [--tab-inset:--spacing(2)] mask-r-from-[calc(100%-1.5rem)] [scrollbar-width:none]',
        props.className,
      )}
    />
  )
}

export function CodeBlockTabsTrigger(props: ComponentProps<typeof TabsTrigger>) {
  return (
    <TabsTrigger
      {...props}
      className={cn(
        'inline-flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-nowrap transition-colors hover:text-fd-accent-foreground data-[state=active]:text-fd-primary [&_svg]:size-3.5',
        props.className,
      )}
    />
  )
}

export function CodeBlockTab(props: ComponentProps<typeof FumadocsCodeBlockTab>) {
  return <FumadocsCodeBlockTab {...props} className={cn('data-[state=active]:contents', props.className)} />
}

export function PopupContent(props: ComponentProps<typeof TwoslashPopupContent>) {
  return (
    <CodeChromeContext value={popupChrome}>
      <TwoslashPopupContent align="start" {...props} />
    </CodeChromeContext>
  )
}

export function PopupTrigger(props: ComponentProps<typeof TwoslashPopupTrigger>) {
  return <TwoslashPopupTrigger {...props} className={cn('border-transparent!', props.className)} />
}
