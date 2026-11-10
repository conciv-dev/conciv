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

export function SiteMovedPage() {
  return (
    <main className="drift" data-conciv-key="sTvMnA">
      <Pill />
      <span className="badge" data-conciv-key="sTvBdg" />
      <MovedBadge />
    </main>
  )
}

function MovedBadge() {
  return <Badge style={{top: 400}} />
}
