import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent } from 'react'
import { inferBackground, inferBackgroundPalette, removeBackground, type PixelImage, type Rgb } from './backgroundRemoval'

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_BYTES = 20 * 1024 * 1024
const MAX_DIMENSION = 4096
const DEFAULT_TOLERANCE = 36

interface LoadedImage {
  readonly name: string
  readonly pixels: PixelImage
}

function paint(canvas: HTMLCanvasElement | null, image: PixelImage) {
  if (!canvas) return
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable in this browser.')
  const imageData = context.createImageData(image.width, image.height)
  imageData.data.set(image.data)
  context.putImageData(imageData, 0, 0)
}

async function decodeImage(file: File): Promise<LoadedImage> {
  if (file.size > MAX_BYTES) throw new Error('That image is larger than 20 MB.')
  const bitmap = await createImageBitmap(file)
  try {
    if (bitmap.width > MAX_DIMENSION || bitmap.height > MAX_DIMENSION) {
      throw new Error('Keep image dimensions at or below 4096 × 4096 pixels.')
    }
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Canvas is unavailable in this browser.')
    context.drawImage(bitmap, 0, 0)
    const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height)
    return {
      name: file.name,
      pixels: { width: bitmap.width, height: bitmap.height, data: new Uint8ClampedArray(imageData.data) },
    }
  } finally {
    bitmap.close()
  }
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not create the PNG.')), 'image/png')
  })
}

function PreviewCanvas({ image, canvasRef, label, onClick, selecting }: {
  image: PixelImage
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  label: string
  onClick?: (event: MouseEvent<HTMLCanvasElement>) => void
  selecting?: boolean
}) {
  useEffect(() => paint(canvasRef.current, image), [canvasRef, image])
  return (
    <canvas
      ref={canvasRef}
      aria-label={label}
      className={selecting ? 'selecting' : ''}
      onClick={onClick}
    />
  )
}

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const originalCanvasRef = useRef<HTMLCanvasElement>(null)
  const resultCanvasRef = useRef<HTMLCanvasElement>(null)
  const [loaded, setLoaded] = useState<LoadedImage | null>(null)
  const [background, setBackground] = useState<Rgb>([255, 255, 255])
  const [backgroundPalette, setBackgroundPalette] = useState<readonly Rgb[]>([])
  const [tolerance, setTolerance] = useState(DEFAULT_TOLERANCE)
  const [selecting, setSelecting] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const result = useMemo(
    () => loaded ? removeBackground(loaded.pixels, { background, backgroundPalette, tolerance }) : null,
    [loaded, background, backgroundPalette, tolerance],
  )

  const acceptFile = async (file?: File) => {
    if (!file || !ACCEPTED_TYPES.includes(file.type)) {
      setMessage('Choose a PNG, JPEG, or WebP image.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const next = await decodeImage(file)
      const palette = inferBackgroundPalette(next.pixels)
      setLoaded(next)
      setBackground(palette[0] ?? inferBackground(next.pixels))
      setBackgroundPalette(palette)
      setTolerance(DEFAULT_TOLERANCE)
      setSelecting(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The image could not be opened.')
    } finally {
      setBusy(false)
    }
  }

  const acceptClipboardItems = async (items: ClipboardItems) => {
    const imageType = items.flatMap((item) => [...item.types]).find((type) => ACCEPTED_TYPES.includes(type))
    const item = items.find((candidate) => imageType && candidate.types.includes(imageType))
    if (!item || !imageType) throw new Error('No supported image was found on the clipboard.')
    const blob = await item.getType(imageType)
    await acceptFile(new File([blob], 'pasted-image.png', { type: imageType }))
  }

  const pasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard?.read) throw new Error('Clipboard access is unavailable.')
      await acceptClipboardItems(await navigator.clipboard.read())
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : 'Clipboard access failed'} Try pressing ⌘V instead.`)
    }
  }

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])].find((candidate) => ACCEPTED_TYPES.includes(candidate.type))
      if (file) {
        event.preventDefault()
        void acceptFile(file)
      } else {
        setMessage('The clipboard does not contain a PNG, JPEG, or WebP image.')
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const resetToAuto = () => {
    if (!loaded) return
    const palette = inferBackgroundPalette(loaded.pixels)
    setBackground(palette[0] ?? inferBackground(loaded.pixels))
    setBackgroundPalette(palette)
    setTolerance(DEFAULT_TOLERANCE)
    setSelecting(false)
    setMessage('Automatic background restored.')
  }

  const chooseBackground = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!selecting || !loaded) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = Math.min(loaded.pixels.width - 1, Math.max(0, Math.floor((event.clientX - bounds.left) * loaded.pixels.width / bounds.width)))
    const y = Math.min(loaded.pixels.height - 1, Math.max(0, Math.floor((event.clientY - bounds.top) * loaded.pixels.height / bounds.height)))
    const offset = (y * loaded.pixels.width + x) * 4
    const sample: Rgb = [loaded.pixels.data[offset], loaded.pixels.data[offset + 1], loaded.pixels.data[offset + 2]]
    setBackground(sample)
    setBackgroundPalette((colors) => [...colors, sample])
    setSelecting(false)
    setMessage('Background sample added.')
  }

  const copyPng = async () => {
    try {
      if (!resultCanvasRef.current || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('Image copying is not supported here.')
      }
      const blob = await canvasBlob(resultCanvasRef.current)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setMessage('Transparent PNG copied. Paste it into Canva with ⌘V.')
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : 'Copy failed'} Use Download PNG instead.`)
    }
  }

  const downloadPng = async () => {
    if (!resultCanvasRef.current || !loaded) return
    try {
      const blob = await canvasBlob(resultCanvasRef.current)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${loaded.name.replace(/\.[^.]+$/, '') || 'cutout'}-transparent.png`
      link.click()
      URL.revokeObjectURL(url)
      setMessage('Transparent PNG downloaded.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Download failed.')
    }
  }

  const startOver = () => {
    setLoaded(null)
    setMessage('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const fileInput = (
    <input
      ref={inputRef}
      className="visually-hidden"
      aria-label="Choose an image"
      type="file"
      accept={ACCEPTED_TYPES.join(',')}
      onChange={(event: ChangeEvent<HTMLInputElement>) => void acceptFile(event.target.files?.[0])}
    />
  )

  return (
    <main>
      <header className="hero">
        <div className="brand-mark" aria-hidden="true">✦</div>
        <div>
          <span className="eyebrow">Local background remover</span>
          <h1>Remove an image background</h1>
          <p>Turn solid or smoothly varied backgrounds transparent—privately, in your browser.</p>
        </div>
        {loaded && <button className="text-button" type="button" onClick={startOver}>Start over</button>}
      </header>

      {!loaded ? (
        <section
          className="drop-zone"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event: DragEvent) => event.preventDefault()}
          onDrop={(event: DragEvent) => {
            event.preventDefault()
            void acceptFile(event.dataTransfer.files[0])
          }}
        >
          {fileInput}
          <div className="upload-icon" aria-hidden="true">↑</div>
          <h2>Drop an image here</h2>
          <p>PNG, JPEG, or WebP · up to 20 MB and 4096 × 4096 px</p>
          <div className="upload-actions">
            <button type="button" className="primary" onClick={(event) => { event.stopPropagation(); inputRef.current?.click() }}>
              Choose image
            </button>
            <span>or</span>
            <button type="button" className="secondary" onClick={(event) => { event.stopPropagation(); void pasteFromClipboard() }}>
              Paste image
            </button>
          </div>
          <small>Tip: you can press ⌘V anywhere on this page</small>
        </section>
      ) : result && (
        <>
          {fileInput}
          <section className="workspace">
            <div className="preview-card">
              <div className="card-heading"><h2>Original</h2><span>{loaded.pixels.width} × {loaded.pixels.height}</span></div>
              <div className="canvas-stage original-stage">
                <PreviewCanvas
                  image={loaded.pixels}
                  canvasRef={originalCanvasRef}
                  label="Original image preview"
                  selecting={selecting}
                  onClick={chooseBackground}
                />
              </div>
            </div>
            <div className="preview-card result-card">
              <div className="card-heading"><h2>Transparent</h2><span className="ready-dot">Ready</span></div>
              <div className="canvas-stage checkerboard">
                <PreviewCanvas image={result} canvasRef={resultCanvasRef} label="Transparent result preview" />
              </div>
            </div>
          </section>

          <section className="control-panel">
            <details className="advanced-tools">
              <summary>Advanced tools</summary>
              <div className="advanced-grid">
                <div className="control-group tolerance-control">
                  <div className="control-title">
                    <label htmlFor="tolerance">Background sensitivity</label>
                    <output htmlFor="tolerance">{tolerance <= 18 ? 'Precise' : tolerance <= 36 ? 'Balanced' : 'Broad'}</output>
                  </div>
                  <input
                    id="tolerance"
                    type="range"
                    min="8"
                    max="64"
                    value={tolerance}
                    onChange={(event) => setTolerance(Number(event.target.value))}
                  />
                  <div className="range-labels"><span>Protect subject</span><span>Clear more variation</span></div>
                </div>
                <div className="control-group selection-control">
                  <span className="control-label">Background samples</span>
                  <div className="sample-row">
                    <span className="color-swatch" style={{ backgroundColor: `rgb(${background.join(',')})` }} aria-label={`Latest color rgb ${background.join(' ')}`} />
                    <button type="button" className={selecting ? 'secondary active' : 'secondary'} onClick={() => setSelecting((value) => !value)}>
                      {selecting ? 'Click the original…' : 'Add background sample'}
                    </button>
                    <button type="button" className="text-button" onClick={resetToAuto}>Reset to auto</button>
                  </div>
                </div>
              </div>
            </details>
            <div className="export-actions">
              <button type="button" className="secondary" onClick={() => void downloadPng()}>Download PNG</button>
              <button type="button" className="primary" onClick={() => void copyPng()}>Copy PNG</button>
            </div>
          </section>
          <p className="privacy-note"><span aria-hidden="true">⌁</span> Your image stays on this device. Nothing is uploaded.</p>
        </>
      )}

      {busy && <p className="notice" role="status">Opening image…</p>}
      {message && <p className="notice" role="alert">{message}</p>}
      <footer>Best for solid colors and smooth gradients with a clearly separated subject.</footer>
    </main>
  )
}
