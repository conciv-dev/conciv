import {createContext, use, type ComponentProps, type ReactNode} from 'react'
import {CodeBlock, CodeBlockTabs as FumadocsCodeBlockTabs, Pre} from 'fumadocs-ui/components/codeblock'
import {PopupContent as TwoslashPopupContent} from 'fumadocs-twoslash/ui'
import {cn} from '@/lib/utils'

const InTwoslashPopup = createContext(false)

function CopyActions({className, children}: {className?: string; children?: ReactNode}) {
  return (
    <div
      className={cn(
        'empty:hidden [&_button]:rounded-md [&_button]:border [&_button]:bg-fd-background [&_button]:shadow-xs',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CodeBlockPre(props: ComponentProps<'pre'>) {
  if (use(InTwoslashPopup)) return <pre {...props} />
  return (
    <CodeBlock {...props} Actions={CopyActions}>
      <Pre>{props.children}</Pre>
    </CodeBlock>
  )
}

export function CodeBlockTabs(props: ComponentProps<typeof FumadocsCodeBlockTabs>) {
  return <FumadocsCodeBlockTabs {...props} className={cn('docs-code-tabs', props.className)} />
}

export function PopupContent(props: ComponentProps<typeof TwoslashPopupContent>) {
  return (
    <InTwoslashPopup value>
      <TwoslashPopupContent {...props} />
    </InTwoslashPopup>
  )
}
