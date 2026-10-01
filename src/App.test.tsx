import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

describe('background removal app', () => {
  it('offers file upload, drag and drop, and clipboard paste', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: /remove an image background/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/choose an image/i)).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp')
    expect(screen.getByText(/drop an image here/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /paste image/i })).toBeInTheDocument()
  })

  it('shows the removal workspace after loading a supported image', async () => {
    const pixels = new Uint8ClampedArray([
      255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 0, 0, 0, 255,
    ])
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 2, height: 2, close: vi.fn() }))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue({ width: 2, height: 2, data: pixels }),
      putImageData: vi.fn(),
      createImageData: vi.fn().mockImplementation((width: number, height: number) => ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
      })),
    } as unknown as CanvasRenderingContext2D)
    const user = userEvent.setup()
    render(<App />)

    await user.upload(screen.getByLabelText(/choose an image/i), new File(['image'], 'screen.png', { type: 'image/png' }))

    expect(await screen.findByRole('heading', { name: 'Original' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Transparent' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: /background sensitivity/i })).not.toBeVisible()
    await user.click(screen.getByText(/advanced tools/i))
    expect(screen.getByRole('slider', { name: /background sensitivity/i })).toBeVisible()
    expect(screen.getByRole('button', { name: /copy png/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download png/i })).toBeInTheDocument()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('explains unsupported files instead of trying to process them', async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<App />)

    await user.upload(screen.getByLabelText(/choose an image/i), new File(['notes'], 'notes.txt', { type: 'text/plain' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/png, jpeg, or webp/i)
  })
})
