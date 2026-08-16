import {cn} from '@/lib/utils'
import {GithubMark} from '@/components/ui/github-mark'
import {repoUrl} from '@/lib/shared'
import {formatStarCount} from '@/lib/star-count'
import {useStarCount} from '@/lib/use-star-count'

export function GitHubStarLink({
  className,
  hideCountOnMobile = false,
}: {
  className?: string
  hideCountOnMobile?: boolean
}) {
  const stars = useStarCount()

  return (
    <a
      href={repoUrl}
      aria-label="conciv on GitHub"
      className={cn('text-sm font-medium text-muted-foreground transition-colors hover:text-foreground', className)}
    >
      <span className="inline-flex items-center gap-1.5">
        <GithubMark className="size-4" />
        GitHub
        {stars !== null ? (
          <span
            className={cn('inline-flex min-w-[2.5ch] justify-end tabular-nums', hideCountOnMobile && 'max-sm:hidden')}
          >
            <span aria-hidden="true">{formatStarCount(stars)}</span>
            <span className="sr-only">{stars} stars</span>
          </span>
        ) : null}
      </span>
    </a>
  )
}
