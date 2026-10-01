export type Rgb = readonly [number, number, number]

export interface PixelImage {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
}

export interface RemovalOptions {
  readonly background: Rgb
  readonly backgroundPalette?: readonly Rgb[]
  readonly tolerance: number
}

function perimeterSamples(image: PixelImage): number[] {
  const samples: number[] = []
  for (let x = 0; x < image.width; x += 1) {
    samples.push(x, (image.height - 1) * image.width + x)
  }
  for (let y = 1; y < image.height - 1; y += 1) {
    samples.push(y * image.width, y * image.width + image.width - 1)
  }

  return samples
}

export function inferBackgroundPalette(image: PixelImage): readonly Rgb[] {
  const buckets = new Map<number, { count: number; red: number; green: number; blue: number }>()
  for (const pixel of perimeterSamples(image)) {
    const offset = pixel * 4
    if (image.data[offset + 3] === 0) continue
    const key =
      (image.data[offset] >> 4) << 8 |
      (image.data[offset + 1] >> 4) << 4 |
      image.data[offset + 2] >> 4
    const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 }
    bucket.count += 1
    bucket.red += image.data[offset]
    bucket.green += image.data[offset + 1]
    bucket.blue += image.data[offset + 2]
    buckets.set(key, bucket)
  }

  const ranked = [...buckets.values()].sort((a, b) => b.count - a.count)
  const minimumCount = Math.max(3, (ranked[0]?.count ?? 0) * 0.02)
  return ranked
    .filter((bucket) => bucket.count >= minimumCount)
    .slice(0, 32)
    .map((bucket) => [
      Math.round(bucket.red / bucket.count),
      Math.round(bucket.green / bucket.count),
      Math.round(bucket.blue / bucket.count),
    ])
}

export function inferBackground(image: PixelImage): Rgb {
  return inferBackgroundPalette(image)[0] ?? [255, 255, 255]
}

function matchesBackground(
  data: Uint8ClampedArray,
  offset: number,
  colors: readonly Rgb[],
  toleranceSquared: number,
): boolean {
  for (const color of colors) {
    const red = data[offset] - color[0]
    const green = data[offset + 1] - color[1]
    const blue = data[offset + 2] - color[2]
    if (red * red + green * green + blue * blue <= toleranceSquared) return true
  }
  return false
}

export function removeBackground(image: PixelImage, options: RemovalOptions): PixelImage {
  const output = new Uint8ClampedArray(image.data)
  const pixelCount = image.width * image.height
  const visited = new Uint8Array(pixelCount)
  const queue = new Uint32Array(pixelCount)
  const colors = options.backgroundPalette?.length ? options.backgroundPalette : [options.background]
  const toleranceSquared = options.tolerance * options.tolerance
  let head = 0
  let tail = 0

  const enqueue = (pixel: number) => {
    if (visited[pixel]) return
    visited[pixel] = 1
    const offset = pixel * 4
    if (image.data[offset + 3] === 0 || matchesBackground(image.data, offset, colors, toleranceSquared)) {
      queue[tail++] = pixel
    }
  }

  for (let x = 0; x < image.width; x += 1) {
    enqueue(x)
    enqueue((image.height - 1) * image.width + x)
  }
  for (let y = 0; y < image.height; y += 1) {
    enqueue(y * image.width)
    enqueue(y * image.width + image.width - 1)
  }

  while (head < tail) {
    const pixel = queue[head++]
    const offset = pixel * 4
    output[offset + 3] = 0
    const x = pixel % image.width
    const y = Math.floor(pixel / image.width)
    if (x > 0) enqueue(pixel - 1)
    if (x + 1 < image.width) enqueue(pixel + 1)
    if (y > 0) enqueue(pixel - image.width)
    if (y + 1 < image.height) enqueue(pixel + image.width)
  }

  return { width: image.width, height: image.height, data: output }
}
