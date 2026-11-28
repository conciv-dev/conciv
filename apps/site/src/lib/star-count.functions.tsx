import type {ReactNode} from 'react'
import {createServerFn} from '@tanstack/react-start'
import {createCompositeComponent, type AnyCompositeComponent} from '@tanstack/react-start/rsc'
import {readStarCount} from '@/lib/star-count.server'
import {formatStarCount} from '@/lib/star-count'

type StarBadgeProps = {children?: ReactNode}

type StarBadgeSource = AnyCompositeComponent & {'~types': {props: StarBadgeProps; return: ReactNode}}

export const getStarBadge = createServerFn({method: 'GET'}).handler(async () => {
  const stars = await readStarCount()
  const src: StarBadgeSource = await createCompositeComponent((props: StarBadgeProps) =>
    stars === null ? null : (
      <span className="inline-flex items-center gap-1">
        {props.children}
        <span className="tabular-nums">
          <span aria-hidden="true">{formatStarCount(stars)}</span>
          <span className="sr-only">{stars} stars</span>
        </span>
      </span>
    ),
  )
  return {src}
})
