import { describe, expect, it } from 'vitest'
import { inferBackground, inferBackgroundPalette, removeBackground } from './backgroundRemoval'

function image(width: number, pixels: ReadonlyArray<readonly [number, number, number, number]>) {
  return {
    width,
    height: pixels.length / width,
    data: new Uint8ClampedArray(pixels.flat()),
  }
}

describe('inferBackground', () => {
  it('uses the dominant color around the perimeter instead of a single corner', () => {
    const white = [255, 255, 255, 255] as const
    const black = [0, 0, 0, 255] as const
    const input = image(3, [black, white, white, white, black, white, white, white, white])

    expect(inferBackground(input)).toEqual([255, 255, 255])
  })
})

describe('removeBackground', () => {
  it('ignores rare perimeter colors that could belong to the subject', () => {
    const gray = [231, 232, 232, 255] as const
    const white = [255, 255, 255, 255] as const
    const input = image(5, [
      gray, gray, white, gray, gray,
      gray, gray, white, gray, gray,
      gray, gray, white, gray, gray,
      gray, gray, white, gray, gray,
      gray, gray, gray, gray, gray,
    ])
    const background = inferBackground(input)
    const backgroundPalette = inferBackgroundPalette(input)

    const output = removeBackground(input, { background, backgroundPalette, tolerance: 20 })

    expect(backgroundPalette).toEqual([[231, 232, 232]])
    expect(output.data[2 * 4 + 3]).toBe(255)
    expect(output.data[0 * 4 + 3]).toBe(0)
  })

  it('removes a gradient background represented by perimeter colors', () => {
    const blueA = [68, 194, 234, 255] as const
    const blueB = [35, 190, 230, 255] as const
    const blueC = [2, 174, 218, 255] as const
    const orange = [220, 160, 80, 255] as const
    const input = image(5, [
      blueA, blueA, blueB, blueC, blueC,
      blueA, blueA, blueB, blueC, blueC,
      blueB, blueB, orange, blueC, blueC,
      blueA, blueA, blueB, blueC, blueC,
      blueA, blueA, blueB, blueC, blueC,
    ])
    const background = inferBackground(input)
    const backgroundPalette = inferBackgroundPalette(input)

    const output = removeBackground(input, { background, backgroundPalette, tolerance: 12 })

    expect(output.data[2 * 4 + 3]).toBe(0)
    expect(output.data[(2 * 5 + 2) * 4 + 3]).toBe(255)
  })

  it('makes a slightly varied screenshot background fully transparent', () => {
    const input = image(3, [
      [229, 229, 229, 255], [236, 237, 236, 255], [227, 231, 230, 255],
      [239, 242, 241, 255], [20, 30, 29, 255], [230, 233, 232, 255],
      [236, 238, 237, 255], [229, 229, 229, 255], [236, 237, 236, 255],
    ])
    const background = inferBackground(input)

    const output = removeBackground(input, { background, tolerance: 36 })

    const backgroundAlphas = [0, 1, 2, 3, 5, 6, 7, 8].map((pixel) => output.data[pixel * 4 + 3])
    expect(backgroundAlphas).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect(output.data[4 * 4 + 3]).toBe(255)
  })

  it('removes a matching background connected to the outer edge', () => {
    const white = [255, 255, 255, 255] as const
    const black = [0, 0, 0, 255] as const
    const input = image(3, [white, white, white, white, black, white, white, white, white])

    const output = removeBackground(input, { background: [255, 255, 255], tolerance: 10 })

    expect([...output.data]).toEqual([
      255, 255, 255, 0, 255, 255, 255, 0, 255, 255, 255, 0,
      255, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255, 0,
      255, 255, 255, 0, 255, 255, 255, 0, 255, 255, 255, 0,
    ])
  })

  it('keeps matching pixels that are enclosed by the foreground', () => {
    const white = [255, 255, 255, 255] as const
    const black = [0, 0, 0, 255] as const
    const input = image(5, [
      white, white, white, white, white,
      white, black, black, black, white,
      white, black, white, black, white,
      white, black, black, black, white,
      white, white, white, white, white,
    ])

    const output = removeBackground(input, { background: [255, 255, 255], tolerance: 10 })

    expect(output.data[12 * 4 + 3]).toBe(255)
    expect(output.data[0 * 4 + 3]).toBe(0)
  })

  it('can cross existing transparency to reach the selected background', () => {
    const transparent = [0, 0, 0, 0] as const
    const input = image(3, [
      transparent, transparent, transparent,
      transparent, [255, 255, 255, 255], transparent,
      transparent, transparent, transparent,
    ])

    const output = removeBackground(input, { background: [255, 255, 255], tolerance: 10 })

    expect(output.data[4 * 4 + 3]).toBe(0)
  })

  it('fully removes near-background pixels while preserving foreground alpha', () => {
    const input = image(3, [
      [255, 255, 255, 255],
      [245, 255, 255, 100],
      [0, 0, 0, 100],
    ])

    const output = removeBackground(input, { background: [255, 255, 255], tolerance: 20 })

    expect(output.data[3]).toBe(0)
    expect(output.data[7]).toBe(0)
    expect(output.data[11]).toBe(100)
  })
})
