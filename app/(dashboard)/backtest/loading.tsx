import { KpiSkeleton, PageSkeleton, TablePanelSkeleton } from '@/components/member/page-skeletons'

export default function BacktestLoading() {
  return (
    <PageSkeleton beta={false}>
      <KpiSkeleton count={2} />
      <TablePanelSkeleton rows={4} columns={4} />
      <TablePanelSkeleton rows={8} columns={4} />
    </PageSkeleton>
  )
}
