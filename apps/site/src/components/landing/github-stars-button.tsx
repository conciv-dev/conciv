import {useState} from 'react'
import {Button} from '@/components/ui/button'
import {GitHubStars} from '@/components/ui/github-stars'
import {GithubMark} from '@/components/ui/github-mark'
import {repoUrl} from '@/lib/shared'
import {formatStarCount} from '@/lib/star-count'
import {useStarCount} from '@/lib/use-star-count'
import {cn} from '@/lib/utils'

export function GitHubStarsButton({className}: {className?: string}) {
  const stars = useStarCount()
  const [hovered, setHovered] = useState(false)
  return (
    <Button asChild variant="outline" className={cn('od-ui gap-2', className)}>
      <a
        href={repoUrl}
        aria-label="conciv on GitHub"
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
      >
        <GithubMark className="size-4" />
        GitHub
        <GitHubStars
          starCount={stars}
          formatCount={formatStarCount}
          hovered={hovered}
          className="text-muted-foreground"
        />
      </a>
    </Button>
  )
}
