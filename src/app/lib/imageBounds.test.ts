import { describe, it, expect } from 'vitest'
import { alphaBounds } from './imageBounds'

function rgba(width: number, height: number, opaque: Array<[number, number, number?]>) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (const [x, y, alpha = 255] of opaque) data[(y * width + x) * 4 + 3] = alpha
  return data
}

describe('alphaBounds', () => {
  it('returns the box of visible pixels', () => {
    const data = rgba(10, 8, [
      [2, 1],
      [7, 5],
    ])
    expect(alphaBounds(data, 10, 8)).toEqual({
      x: 2,
      y: 1,
      width: 6,
      height: 5,
      naturalWidth: 10,
      naturalHeight: 8,
    })
  })

  it('ignores nearly transparent pixels', () => {
    const data = rgba(10, 10, [
      [0, 0, 5],
      [4, 4],
    ])
    expect(alphaBounds(data, 10, 10)).toMatchObject({ x: 4, y: 4, width: 1, height: 1 })
  })

  it('falls back to the full image when fully transparent', () => {
    expect(alphaBounds(rgba(4, 3, []), 4, 3)).toMatchObject({ x: 0, y: 0, width: 4, height: 3 })
  })
})
