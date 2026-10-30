import { useEffect, useState, type ReactNode } from 'react'
import { loadImageBounds, type ImageBounds } from '../../lib/imageBounds'

// Les vignettes ont des marges transparentes différentes : on recadre chaque
// image sur ses pixels visibles pour qu'elles aient toutes la même hauteur
// (largeur libre, plafonnée à celle de la colonne), centrées.
export default function Arc({
  src,
  height,
  maxWidth,
}: {
  src: string
  height: number
  maxWidth: number
}) {
  const [measured, setMeasured] = useState<{ src: string; bounds: ImageBounds | null } | null>(null)
  // undefined = en cours de mesure, null = mesure impossible (image entière).
  const bounds = measured?.src === src ? measured.bounds : undefined

  useEffect(() => {
    let cancelled = false
    loadImageBounds(src).then((b) => {
      if (!cancelled) setMeasured({ src, bounds: b })
    })
    return () => {
      cancelled = true
    }
  }, [src])

  let content: ReactNode = null
  if (bounds) {
    const scale = Math.min(height / bounds.height, maxWidth / bounds.width)
    content = (
      <div
        className="relative overflow-hidden"
        style={{ width: bounds.width * scale, height: bounds.height * scale }}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          className="absolute max-w-none"
          style={{
            width: bounds.naturalWidth * scale,
            height: bounds.naturalHeight * scale,
            left: -bounds.x * scale,
            top: -bounds.y * scale,
          }}
        />
      </div>
    )
  } else if (bounds === null) {
    content = <img src={src} alt="" draggable={false} style={{ width: height, height }} />
  }

  return (
    <div
      className="w-full flex justify-center items-center cursor-pointer active:scale-95 transition-transform duration-150"
      style={{ height, WebkitAppRegion: 'no-drag' }}
    >
      {content}
    </div>
  )
}
