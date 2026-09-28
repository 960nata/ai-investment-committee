import { FormPanelSkeleton, KpiSkeleton, PageSkeleton } from '@/components/member/page-skeletons'

export default function ProfileLoading() {
  return (
    <PageSkeleton beta={false}>
      <FormPanelSkeleton fields={2} />
      <KpiSkeleton count={3} />
    </PageSkeleton>
  )
}
