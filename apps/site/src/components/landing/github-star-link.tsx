import {cn} from '@/lib/utils'
import {repoUrl} from '@/lib/shared'
import {formatStarCount} from '@/lib/star-count'
import {useStarCount} from '@/lib/star-count-store'
import GithubIcon from '@/components/ui/github-icon'
import StarIcon from '@/components/ui/star-icon'
import {useAnimatedIcon} from '@/components/ui/use-animated-icon'

function GithubMark({className}: {className?: string}) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

function StarCount({stars, className}: {stars: number; className?: string}) {
  return (
    <span className={cn('inline-flex min-w-[2.5ch] justify-end tabular-nums', className)}>
      <span aria-hidden="true">{formatStarCount(stars)}</span>
      <span className="sr-only">{stars} stars</span>
    </span>
  )
}

function CompactGitHubLink({className}: {className?: string}) {
  const stars = useStarCount()
  const {iconRef: githubRef, triggerProps: githubTrigger} = useAnimatedIcon()
  const {iconRef: starRef, triggerProps: starTrigger} = useAnimatedIcon()
  const both = (key: keyof typeof githubTrigger) => () => {
    githubTrigger[key]()
    starTrigger[key]()
  }
  return (
    <a
      href={repoUrl}
      aria-label="conciv on GitHub"
      onPointerEnter={both('onPointerEnter')}
      onPointerLeave={both('onPointerLeave')}
      onFocus={both('onFocus')}
      onBlur={both('onBlur')}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md p-2 text-xs leading-4 font-medium text-muted-foreground transition-colors hover:text-foreground',
        className,
      )}
    >
      <GithubIcon ref={githubRef} className="size-4" />
      {stars !== null ? (
        <span className="inline-flex items-center gap-0.5">
          <StarIcon ref={starRef} className="size-3" />
          <StarCount stars={stars} className="min-w-0 justify-start" />
        </span>
      ) : null}
    </a>
  )
}

export function GitHubStarLink({className, compact = false}: {className?: string; compact?: boolean}) {
  const stars = useStarCount()
  if (compact) return <CompactGitHubLink className={className} />
  return (
    <a
      href={repoUrl}
      aria-label="conciv on GitHub"
      className={cn('text-sm font-medium text-muted-foreground transition-colors hover:text-foreground', className)}
    >
      <span className="inline-flex items-center gap-1.5">
        <GithubMark className="size-4" />
        GitHub
        {stars !== null ? <StarCount stars={stars} /> : null}
      </span>
    </a>
  )
}
