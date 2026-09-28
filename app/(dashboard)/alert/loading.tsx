import { FormPanelSkeleton, PageSkeleton, TablePanelSkeleton } from '@/components/member/page-skeletons'

export default function AlertLoading() {
  return (
    <PageSkeleton>
      <FormPanelSkeleton fields={3} />
      <TablePanelSkeleton rows={4} columns={5} />
      <TablePanelSkeleton rows={3} columns={3} />
    </PageSkeleton>
  )
}
