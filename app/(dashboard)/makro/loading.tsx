import { CardsPanelSkeleton, PageSkeleton } from '@/components/member/page-skeletons'

export default function MacroLoading() {
  return (
    <PageSkeleton>
      <CardsPanelSkeleton cards={4} />
      <CardsPanelSkeleton cards={6} />
    </PageSkeleton>
  )
}
