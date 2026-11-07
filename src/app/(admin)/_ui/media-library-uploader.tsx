'use client'

import { useRouter } from 'next/navigation'

import { MediaUploader } from './media-uploader'

/** The media library's bulk uploader: refreshes the grid when a batch ends. */
export function MediaLibraryUploader({ maxBytes }: { maxBytes: number }) {
  const router = useRouter()
  return (
    <MediaUploader
      maxBytes={maxBytes}
      onAllDone={(done) => {
        if (done.length > 0) router.refresh()
      }}
    />
  )
}
