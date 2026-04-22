import { describe, expect, it, vi } from 'vitest'

import { composePrintablePhoto, printCompositionConfig, printWindow } from './printComposition'

describe('composePrintablePhoto', () => {
  it('generates a 900x1600 jpeg and places the photo with centered cover sizing', async () => {
    const drawImage = vi.fn()
    const context = {
      beginPath: vi.fn(),
      clip: vi.fn(),
      drawImage,
      rect: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
    } as unknown as CanvasRenderingContext2D

    const canvas = {
      getContext: vi.fn(() => context),
      height: 0,
      width: 0,
    } as unknown as HTMLCanvasElement

    const outputBlob = new Blob(['print-ready'], { type: 'image/jpeg' })
    const sourcePhoto = new Blob(['captured'], { type: 'image/jpeg' })
    const frameImage = { width: 900, height: 1600 } as DrawableTestImage
    const photoImage = { width: 1000, height: 1000 } as DrawableTestImage

    const result = await composePrintablePhoto(sourcePhoto, {
      canvasToBlob: vi.fn(async (renderedCanvas, type, quality) => {
        expect(renderedCanvas).toBe(canvas)
        expect(type).toBe('image/jpeg')
        expect(quality).toBe(0.92)
        return outputBlob
      }),
      createCanvas: () => canvas,
      loadFrame: async () => frameImage,
      loadPhoto: async (photo) => {
        expect(photo).toBe(sourcePhoto)
        return photoImage
      },
    })

    expect(canvas.width).toBe(printCompositionConfig.outputWidth)
    expect(canvas.height).toBe(printCompositionConfig.outputHeight)
    expect(context.rect).toHaveBeenCalledWith(66, 223, 767, 1154)
    expect(drawImage).toHaveBeenCalledTimes(5)

    const coverPlacement = printWindow.getCoverPlacement(
      photoImage.width,
      photoImage.height,
      printWindow.getRect(printCompositionConfig.outputWidth, printCompositionConfig.outputHeight),
    )

    expect(coverPlacement.x).toBeCloseTo(-127.5)
    expect(coverPlacement.y).toBe(223)
    expect(coverPlacement.width).toBeCloseTo(1154)
    expect(coverPlacement.height).toBeCloseTo(1154)
    expect(drawImage.mock.calls[0]).toEqual([
      photoImage,
      coverPlacement.x,
      coverPlacement.y,
      coverPlacement.width,
      coverPlacement.height,
    ])
    expect(result).toBe(outputBlob)
  })
})

type DrawableTestImage = CanvasImageSource & {
  width: number
  height: number
}
