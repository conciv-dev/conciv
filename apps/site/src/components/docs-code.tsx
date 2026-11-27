import {createContext, use, type ComponentProps, type ReactNode} from 'react'
import {
  CodeBlock,
  CodeBlockTab as FumadocsCodeBlockTab,
  CodeBlockTabs as FumadocsCodeBlockTabs,
  CodeBlockTabsList as FumadocsCodeBlockTabsList,
  Pre,
} from 'fumadocs-ui/components/codeblock'
import {PopupContent as TwoslashPopupContent, PopupTrigger as TwoslashPopupTrigger} from 'fumadocs-twoslash/ui'
import {cn} from '@/lib/utils'

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
        'static flex h-9.5 items-center justify-end rounded-none border-b pe-2 backdrop-blur-none',
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
  figureClass: 'contents',
  viewportClass: 'col-span-full',
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
      <FumadocsCodeBlockTabs
        {...props}
        className={cn('grid grid-cols-[auto_minmax(0,1fr)] overflow-hidden', props.className)}
      />
    </CodeChromeContext>
  )
}

export function CodeBlockTabsList(props: ComponentProps<typeof FumadocsCodeBlockTabsList>) {
  return <FumadocsCodeBlockTabsList {...props} className={cn('col-start-1 row-start-1 border-b', props.className)} />
}

export function CodeBlockTab(props: ComponentProps<typeof FumadocsCodeBlockTab>) {
  return <FumadocsCodeBlockTab {...props} className={cn('data-[state=active]:contents', props.className)} />
}

export function PopupContent(props: ComponentProps<typeof TwoslashPopupContent>) {
  return (
    <CodeChromeContext value={popupChrome}>
      <TwoslashPopupContent {...props} />
    </CodeChromeContext>
  )
}

export function PopupTrigger(props: ComponentProps<typeof TwoslashPopupTrigger>) {
  return <TwoslashPopupTrigger {...props} className={cn('border-transparent!', props.className)} />
}
