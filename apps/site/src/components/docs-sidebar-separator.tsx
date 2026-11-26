import type * as PageTree from 'fumadocs-core/page-tree'
import {SidebarSeparator} from 'fumadocs-ui/components/sidebar/base'

export function DocsSidebarSeparator({item}: {item: PageTree.Separator}) {
  return (
    <SidebarSeparator className="px-2 pt-6 pb-1 text-xs font-medium text-fd-muted-foreground first:pt-0">
      {item.name}
    </SidebarSeparator>
  )
}
