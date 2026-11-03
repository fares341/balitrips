/**
 * Activities hub while it loads (states.html "Loading"): the banner's
 * footprint, then three card skeletons — the same shapes the page settles
 * into, so nothing jumps when the results arrive.
 */

import { CardSkeleton, Skeleton } from '@/components/bt/states'

import '@/styles/bt-activity.css'

export default function ActivitiesLoading() {
  return (
    <main aria-busy="true">
      <Skeleton height={340} radius={0} className="act-hub-skel-banner" />
      <section className="sec-tight">
        <div className="wrap stack" style={{ gap: 16 }}>
          <Skeleton width="40%" height={22} />
          <div className="grid g3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </div>
      </section>
    </main>
  )
}
