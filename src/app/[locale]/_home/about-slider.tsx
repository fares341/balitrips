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

export type AboutSliderProps = {
  up: readonly string[]
  down: readonly string[]
}

export function AboutSlider({ up, down }: AboutSliderProps) {
  return (
    <div className="about-media">
      <Column images={up} direction="up" />
      <Column images={down} direction="down" />
    </div>
  )
}

function Column({ images, direction }: { images: readonly string[]; direction: 'up' | 'down' }) {
  // Two identical halves; the second is decorative duplication.
  const track = [...images, ...images]
  return (
    <div className={`mq-col ${direction}`} aria-hidden="true">
      <div className="mq-track">
        {track.map((src, index) => (
          // eslint-disable-next-line @next/next/no-img-element -- fixed brand photos in a CSS marquee
          <img key={`${src}-${index}`} src={src} alt="" decoding="async" />
        ))}
      </div>
    </div>
  )
}
