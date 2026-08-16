import {Menu} from 'lucide-react'
import type {ReactNode} from 'react'
import {Button} from '@/components/ui/button'
import {Separator} from '@/components/ui/separator'
import {Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger} from '@/components/ui/sheet'
import {cn} from '@/lib/utils'

export type HeaderLink = {label: string; node: ReactNode}

export function SiteHeader({
  brand,
  links,
  actions,
  mobileActions,
  className,
}: {
  brand: ReactNode
  links: HeaderLink[]
  actions: ReactNode
  mobileActions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('relative flex h-14 w-full items-center', className)}>
      <div className="flex shrink-0 items-center">{brand}</div>

      <nav aria-label="Main" className="ml-6 hidden items-center gap-1 md:flex">
        {links.map((link) => (
          <span key={link.label}>{link.node}</span>
        ))}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <span className="max-sm:hidden">{actions}</span>
        <Separator orientation="vertical" className="hidden h-8 sm:block" />
        {mobileActions}

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Open menu" className="md:hidden">
              <Menu aria-hidden />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-xs">
            <SheetHeader>
              <SheetTitle>{brand}</SheetTitle>
            </SheetHeader>
            <nav aria-label="Main" className="flex flex-col px-2">
              {links.map((link) => (
                <SheetClose key={link.label} asChild>
                  <span className="py-2">{link.node}</span>
                </SheetClose>
              ))}
              <span className="py-2 sm:hidden">{actions}</span>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
