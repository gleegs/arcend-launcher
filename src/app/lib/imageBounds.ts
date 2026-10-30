export interface ImageBounds {
  x: number
  y: number
  width: number
  height: number
  naturalWidth: number
  naturalHeight: number
}

// Seuil d'alpha en dessous duquel un pixel compte comme transparent (ignore
// les halos quasi invisibles laissés par l'antialiasing).
const ALPHA_THRESHOLD = 8

/**
 * Rectangle des pixels visibles d'une image RGBA (`data` d'un ImageData).
 * Renvoie l'image entière si elle est totalement transparente.
 */
export function alphaBounds(data: Uint8ClampedArray, width: number, height: number): ImageBounds {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const full = { naturalWidth: width, naturalHeight: height }
  if (maxX < 0) return { x: 0, y: 0, width, height, ...full }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, ...full }
}

const cache = new Map<string, Promise<ImageBounds | null>>()

/**
 * Charge l'image et calcule ses bords visibles (null si l'image ne peut pas
 * être lue en canvas, ex. serveur sans CORS). Résultat mémorisé par URL.
 */
export function loadImageBounds(src: string): Promise<ImageBounds | null> {
  let pending = cache.get(src)
  if (!pending) {
    pending = new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (!ctx) return resolve(null)
          ctx.drawImage(img, 0, 0)
          const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
          resolve(alphaBounds(data, canvas.width, canvas.height))
        } catch {
          resolve(null)
        }
      }
      img.onerror = () => resolve(null)
      img.src = src
    })
    cache.set(src, pending)
  }
  return pending
}
