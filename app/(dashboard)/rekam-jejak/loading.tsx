import { KpiSkeleton, PageSkeleton, TablePanelSkeleton } from '@/components/member/page-skeletons'

export default function TrackRecordLoading() {
  return (
    <PageSkeleton>
      <KpiSkeleton count={4} />
      <TablePanelSkeleton rows={8} columns={5} />
    </PageSkeleton>
  )
}
