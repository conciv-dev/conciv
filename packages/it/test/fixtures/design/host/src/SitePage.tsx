import {Badge} from './ui-kit/Badge'
import {Pill} from './ui-kit/Pill'

export function SiteKitPage() {
  return (
    <main className="drift" data-conciv-key="sTkMnA">
      <Pill />
      <Badge />
    </main>
  )
}

export function SiteHandPage() {
  return (
    <main className="drift" data-conciv-key="sThMnA">
      <Pill />
      <span className="badge" data-conciv-key="sThBdg" />
    </main>
  )
}
