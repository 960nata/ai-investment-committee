import { PageSkeleton, TablePanelSkeleton } from '@/components/member/page-skeletons'

export default function InstrumentsLoading() {
  return (
    <PageSkeleton beta={false}>
      <TablePanelSkeleton rows={10} columns={6} />
    </PageSkeleton>
  )
}
