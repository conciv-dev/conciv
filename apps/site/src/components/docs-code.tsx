import {createContext, use, type ComponentProps, type ReactNode} from 'react'
import {
  CodeBlock,
  CodeBlockTab as FumadocsCodeBlockTab,
  CodeBlockTabs as FumadocsCodeBlockTabs,
  CodeBlockTabsList as FumadocsCodeBlockTabsList,
  Pre,
} from 'fumadocs-ui/components/codeblock'
import {PopupContent as TwoslashPopupContent} from 'fumadocs-twoslash/ui'
import {cn} from '@/lib/utils'

const InTwoslashPopup = createContext(false)
const InCodeTabs = createContext(false)

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

export function CodeBlockPre(props: ComponentProps<'pre'>) {
  const inTabs = use(InCodeTabs)
  if (use(InTwoslashPopup)) return <pre {...props} />
  return (
    <CodeBlock
      {...props}
      className={cn(inTabs && 'contents', props.className)}
      viewportProps={{className: cn(inTabs && 'col-span-full')}}
      Actions={inTabs && !props.title ? TabBarCopyActions : CopyActions}
    >
      <Pre>{props.children}</Pre>
    </CodeBlock>
  )
}

export function CodeBlockTabs(props: ComponentProps<typeof FumadocsCodeBlockTabs>) {
  return (
    <InCodeTabs value>
      <FumadocsCodeBlockTabs
        {...props}
        className={cn('grid grid-cols-[auto_minmax(0,1fr)] overflow-hidden', props.className)}
      />
    </InCodeTabs>
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
    <InTwoslashPopup value>
      <TwoslashPopupContent {...props} />
    </InTwoslashPopup>
  )
}
