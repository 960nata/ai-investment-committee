import { PageSkeleton, TablePanelSkeleton } from '@/components/member/page-skeletons'

/** Cadangan untuk halaman dashboard yang belum punya skeleton sendiri. */
export default function DashboardLoading() {
  return (
    <PageSkeleton beta={false}>
      <TablePanelSkeleton rows={8} />
    </PageSkeleton>
  )
}
