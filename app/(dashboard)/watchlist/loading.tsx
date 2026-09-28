import { PageSkeleton, TablePanelSkeleton } from '@/components/member/page-skeletons'

export default function WatchlistLoading() {
  return (
    <PageSkeleton>
      <TablePanelSkeleton rows={6} columns={6} />
    </PageSkeleton>
  )
}
