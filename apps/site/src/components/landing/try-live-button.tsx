import {Button} from '@/components/ui/button'

export function TryLiveButton() {
  return (
    <div className="mt-6">
      <Button variant="outline" onClick={() => window.dispatchEvent(new Event('conciv:open-panel'))}>
        <span className="size-1.5 rounded-full bg-primary" aria-hidden /> Try it live — connect your agent
      </Button>
    </div>
  )
}
