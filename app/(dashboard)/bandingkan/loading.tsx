import { FormPanelSkeleton, PageSkeleton, TablePanelSkeleton } from '@/components/member/page-skeletons'

export default function CompareLoading() {
  return (
    <PageSkeleton>
      <FormPanelSkeleton fields={1} />
      <TablePanelSkeleton rows={10} columns={3} />
    </PageSkeleton>
  )
}
