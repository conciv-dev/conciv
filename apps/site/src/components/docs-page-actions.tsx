import {FileText, MessagesSquare, SquarePen} from 'lucide-react'
import {MarkdownCopyButton} from 'fumadocs-ui/layouts/notebook/page'
import {SITE} from '@/lib/site-urls'

const rowClass =
  'inline-flex items-center gap-2.5 py-1.5 text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground [&_svg]:size-4 [&_svg]:shrink-0'

export function DocsPageActions({markdownUrl, githubUrl}: {markdownUrl: string; githubUrl: string}) {
  const prompt = `Read ${SITE}${markdownUrl}, I want to ask questions about it.`
  const links = [
    {label: 'View .md', href: markdownUrl, icon: <FileText />},
    {
      label: 'Open in Claude',
      href: `https://claude.ai/new?${new URLSearchParams({q: prompt})}`,
      icon: <MessagesSquare />,
    },
    {
      label: 'Open in ChatGPT',
      href: `https://chatgpt.com/?${new URLSearchParams({prompt, hints: 'search'})}`,
      icon: <MessagesSquare />,
    },
  ]

  return (
    <div className="flex flex-col border-t pt-4">
      <a href={githubUrl} target="_blank" rel="noreferrer noopener" className={rowClass}>
        <SquarePen />
        Edit on GitHub
      </a>
      <MarkdownCopyButton
        markdownUrl={markdownUrl}
        className={`${rowClass} h-auto justify-start rounded-none border-0 bg-transparent px-0 hover:bg-transparent`}
      >
        Copy as Markdown
      </MarkdownCopyButton>
      {links.map((link) => (
        <a key={link.label} href={link.href} target="_blank" rel="noreferrer noopener" className={rowClass}>
          {link.icon}
          {link.label}
        </a>
      ))}
    </div>
  )
}
