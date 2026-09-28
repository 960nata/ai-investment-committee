import { KpiSkeleton, PageSkeleton, TablePanelSkeleton } from '@/components/member/page-skeletons'

export default function OwnershipLoading() {
  return (
    <PageSkeleton>
      <KpiSkeleton count={3} />
      <TablePanelSkeleton rows={6} columns={4} />
    </PageSkeleton>
  )
}
