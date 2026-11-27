import {Check, Minus, X, type LucideIcon} from 'lucide-react'
import {cn} from '@/lib/utils'

function Status({icon: Icon, label, className}: {icon: LucideIcon; label: string; className: string}) {
  return (
    <span className="inline-flex align-middle">
      <Icon aria-hidden className={cn('size-5', className)} strokeWidth={2.5} />
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function Yes() {
  return <Status icon={Check} label="Yes" className="text-fd-success" />
}

export function Partly() {
  return <Status icon={Minus} label="Partly" className="text-fd-warning" />
}

export function No() {
  return <Status icon={X} label="No" className="text-fd-error" />
}
