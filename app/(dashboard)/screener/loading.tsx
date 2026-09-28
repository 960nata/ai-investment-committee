import { FormPanelSkeleton, PageSkeleton, TablePanelSkeleton } from '@/components/member/page-skeletons'

export default function ScreenerLoading() {
  return (
    <PageSkeleton>
      <FormPanelSkeleton fields={5} />
      <TablePanelSkeleton rows={10} columns={6} />
    </PageSkeleton>
  )
}
