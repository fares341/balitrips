/**
 * "Who we are" image slider — the package's infinite vertical marquee
 * (home.html `.about-media`): two columns, one moving up and one down.
 *
 * The motion is CSS only (bt-home.css `.mq-track`): each track holds its
 * images twice and shifts by half its height, so the loop is seamless. It
 * pauses on hover and while anything inside the section has focus, and is
 * static under `prefers-reduced-motion`. Client revision 1 removed the
 * play/pause button that sat over the photos, so this is a Server Component.
 */

import { BrandImg } from '@/components/ui/brand-img'

export type SliderPhoto = { src: string; alt: string }

export type AboutSliderProps = {
  up: readonly SliderPhoto[]
  down: readonly SliderPhoto[]
}

/** Each column is about half the "who we are" grid: ~45vw on phones, ~260px on desktop. */
const SIZES = '(min-width: 1000px) 260px, 46vw'

export function AboutSlider({ up, down }: AboutSliderProps) {
  return (
    <div className="about-media">
      <Column images={up} direction="up" />
      <Column images={down} direction="down" />
    </div>
  )
}

function Column({ images, direction }: { images: readonly SliderPhoto[]; direction: 'up' | 'down' }) {
  // Two identical halves for a seamless loop. The first half is the real
  // content (meaningful alt); the clone half is hidden from assistive tech
  // and carries empty alt, so a screen reader hears each photo once.
  return (
    <div className={`mq-col ${direction}`}>
      <div className="mq-track">
        {images.map((photo) => (
          <BrandImg key={photo.src} src={photo.src} alt={photo.alt} sizes={SIZES} />
        ))}
        <span className="mq-clone" aria-hidden="true">
          {images.map((photo) => (
            <BrandImg key={`${photo.src}-clone`} src={photo.src} alt="" sizes={SIZES} />
          ))}
        </span>
      </div>
    </div>
  )
}
