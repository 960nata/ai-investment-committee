import { FormPanelSkeleton, KpiSkeleton, PageSkeleton, TablePanelSkeleton } from '@/components/member/page-skeletons'

export default function PortfolioLoading() {
  return (
    <PageSkeleton>
      <KpiSkeleton count={2} />
      <FormPanelSkeleton fields={4} />
      <TablePanelSkeleton rows={4} columns={6} />
    </PageSkeleton>
  )
}
