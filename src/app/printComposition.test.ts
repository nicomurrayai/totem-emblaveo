import { describe, expect, it, vi } from 'vitest'

import { composePrintablePhoto, printCompositionConfig, printWindow } from './printComposition'

describe('composePrintablePhoto', () => {
  it('generates a 1218x1864 jpeg and places the photo with centered contain sizing', async () => {
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
    const frameImage = {
      width: printCompositionConfig.outputWidth,
      height: printCompositionConfig.outputHeight,
    } as DrawableTestImage
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
    expect(context.rect).toHaveBeenCalledWith(221, expect.closeTo(247), 776, 1223)
    expect(drawImage).toHaveBeenCalledTimes(6)

    const containPlacement = printWindow.getContainPlacement(
      photoImage.width,
      photoImage.height,
      printWindow.getRect(printCompositionConfig.outputWidth, printCompositionConfig.outputHeight),
    )

    expect(containPlacement.x).toBe(221)
    expect(containPlacement.y).toBeCloseTo(470.5)
    expect(containPlacement.width).toBe(776)
    expect(containPlacement.height).toBe(776)
    expect(drawImage.mock.calls[0]).toEqual([
      frameImage,
      0,
      0,
      printCompositionConfig.outputWidth,
      printCompositionConfig.outputHeight,
    ])
    expect(drawImage.mock.calls[1]).toEqual([
      photoImage,
      containPlacement.x,
      containPlacement.y,
      containPlacement.width,
      containPlacement.height,
    ])
    expect(result).toBe(outputBlob)
  })
})

type DrawableTestImage = CanvasImageSource & {
  width: number
  height: number
}
