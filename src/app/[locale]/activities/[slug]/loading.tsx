/** Activity page while it loads: gallery, title and the two columns. */

import { Skeleton } from '@/components/bt/states'

import '@/styles/bt-activity.css'

export default function ActivityLoading() {
  return (
    <main className="act-detail" aria-busy="true">
      <div className="wrap">
        <Skeleton width={220} height={14} style={{ marginBlock: 16 }} />
        <Skeleton height={428} radius={28} />
        <div className="stack" style={{ gap: 10, paddingBlock: 22 }}>
          <Skeleton width={160} height={22} />
          <Skeleton width="60%" height={40} />
          <Skeleton width="40%" />
        </div>
        <div className="act-layout">
          <div className="stack" style={{ gap: 14 }}>
            <Skeleton height={44} />
            <Skeleton width="30%" height={24} />
            <Skeleton height={14} />
            <Skeleton width="80%" height={14} />
            <Skeleton height={180} radius={20} />
          </div>
          <Skeleton height={520} radius={22} />
        </div>
      </div>
    </main>
  )
}
