import {Link} from '@tanstack/react-router'
import {ChevronRight} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Table, TableBody, TableCell, TableRow} from '@/components/ui/table'
import {repoUrl} from '@/lib/shared'
import {formatStarCount} from '@/lib/star-count'
import {useStarCount} from '@/lib/use-star-count'

export function OpenSourceStrip() {
  const stars = useStarCount()

  return (
    <section className="od-ruled">
      <div className="od-page">
        <div className="od-col grid grid-cols-1 divide-y md:grid-cols-2 md:divide-x md:divide-y-0 md:[&>*:last-child]:border-r md:[&>*:last-child]:border-r-transparent">
          <div className="od-inset py-16">
            <p className="od-eyebrow">Open source</p>
            <h2 className="od-h2 mt-2 max-w-[400px]">Open source, on your machine.</h2>
            <div className="mt-8 flex flex-wrap gap-2">
              <Button asChild variant="outline" className="od-hit">
                <a href={repoUrl}>
                  Star on GitHub <ChevronRight data-icon="inline-end" />
                </a>
              </Button>
              <Button asChild variant="outline" className="od-hit">
                <Link to="/docs/$" params={{_splat: ''}}>
                  Read the docs <ChevronRight data-icon="inline-end" />
                </Link>
              </Button>
            </div>
          </div>
          <div className="od-inset py-16">
            <Table className="od-mono od-caption">
              <TableBody>
                {stars !== null && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="px-0 text-muted-foreground">stars</TableCell>
                    <TableCell className="px-0 text-right tabular-nums">{formatStarCount(stars)}</TableCell>
                  </TableRow>
                )}
                <TableRow className="hover:bg-transparent">
                  <TableCell className="px-0 text-muted-foreground">license</TableCell>
                  <TableCell className="px-0 text-right">MIT</TableCell>
                </TableRow>
                <TableRow className="hover:bg-transparent">
                  <TableCell className="px-0 text-muted-foreground">conciv-hosted services</TableCell>
                  <TableCell className="px-0 text-right">none</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </section>
  )
}
