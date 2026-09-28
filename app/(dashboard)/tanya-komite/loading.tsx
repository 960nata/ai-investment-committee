import { ChatPanelSkeleton, PageSkeleton } from '@/components/member/page-skeletons'

export default function AskLoading() {
  return (
    <PageSkeleton>
      <ChatPanelSkeleton />
    </PageSkeleton>
  )
}
