import {useState, type FocusEvent, type PointerEvent} from 'react'
import {Button} from '@/components/ui/button'
import {GitHubStars} from '@/components/ui/github-stars'
import {GithubMark} from '@/components/ui/github-mark'
import {repoUrl} from '@/lib/shared'
import {formatStarCount} from '@/lib/star-count'
import {useStarCount} from '@/lib/use-star-count'
import {cn} from '@/lib/utils'

export function GitHubStarsButton({className}: {className?: string}) {
  const {stars, settled} = useStarCount()
  const [hovered, setHovered] = useState(false)
  const hoverIn = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch') setHovered(true)
  }
  const focusIn = (event: FocusEvent<HTMLElement>) => {
    if (event.currentTarget.matches(':focus-visible')) setHovered(true)
  }
  return (
    <Button asChild variant="outline" className={cn('od-ui gap-2', className)}>
      <a
        className="od-hit group"
        href={repoUrl}
        aria-label="conciv on GitHub"
        onPointerEnter={hoverIn}
        onPointerLeave={() => setHovered(false)}
        onFocus={focusIn}
        onBlur={() => setHovered(false)}
      >
        <GithubMark className="size-4" />
        GitHub
        <GitHubStars
          starCount={stars}
          pending={!settled}
          formatCount={formatStarCount}
          hovered={hovered}
          className="text-muted-foreground"
        />
      </a>
    </Button>
  )
}
