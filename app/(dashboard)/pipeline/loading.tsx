import { KpiSkeleton, PageSkeleton, TablePanelSkeleton } from '@/components/member/page-skeletons'

export default function PipelineLoading() {
  return (
    <PageSkeleton beta={false}>
      <KpiSkeleton count={4} />
      <TablePanelSkeleton rows={8} columns={5} />
    </PageSkeleton>
  )
}
