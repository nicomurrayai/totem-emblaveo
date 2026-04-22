import frameAssetUrl from '../assets/marco.jpeg'

const outputWidth = 900
const outputHeight = 1600

const frameWindow = {
  x: 66 / outputWidth,
  y: 223 / outputHeight,
  width: 767 / outputWidth,
  height: 1154 / outputHeight,
}

type DrawableImage = CanvasImageSource & {
  width: number
  height: number
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface ComposePrintablePhotoOptions {
  canvasToBlob?: (
    canvas: HTMLCanvasElement,
    type: string,
    quality: number,
  ) => Promise<Blob>
  createCanvas?: () => HTMLCanvasElement
  loadFrame?: () => Promise<DrawableImage>
  loadPhoto?: (photo: Blob) => Promise<DrawableImage>
}

let cachedFramePromise: Promise<DrawableImage> | null = null

function createCanvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
          return
        }

        reject(new Error('No pudimos generar la composicion para impresion.'))
      },
      type,
      quality,
    )
  })
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`No pudimos cargar la imagen ${src}.`))
    image.decoding = 'async'
    image.src = src
  })
}

async function loadPhotoImage(photo: Blob) {
  const photoUrl = URL.createObjectURL(photo)

  try {
    return await loadImage(photoUrl)
  } finally {
    URL.revokeObjectURL(photoUrl)
  }
}

function loadFrameImage() {
  if (!cachedFramePromise) {
    cachedFramePromise = loadImage(frameAssetUrl).catch((error) => {
      cachedFramePromise = null
      throw error
    })
  }

  return cachedFramePromise
}

function getWindowRect(width: number, height: number): Rect {
  return {
    x: width * frameWindow.x,
    y: height * frameWindow.y,
    width: width * frameWindow.width,
    height: height * frameWindow.height,
  }
}

function getCoverPlacement(sourceWidth: number, sourceHeight: number, targetRect: Rect): Rect {
  const scale = Math.max(targetRect.width / sourceWidth, targetRect.height / sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale

  return {
    x: targetRect.x + (targetRect.width - width) / 2,
    y: targetRect.y + (targetRect.height - height) / 2,
    width,
    height,
  }
}

function drawFrameBands(
  context: CanvasRenderingContext2D,
  frame: DrawableImage,
  sourceWindow: Rect,
  destinationWindow: Rect,
) {
  const sourceRightX = sourceWindow.x + sourceWindow.width
  const sourceBottomY = sourceWindow.y + sourceWindow.height
  const destinationRightX = destinationWindow.x + destinationWindow.width
  const destinationBottomY = destinationWindow.y + destinationWindow.height

  context.drawImage(
    frame,
    0,
    0,
    frame.width,
    sourceWindow.y,
    0,
    0,
    outputWidth,
    destinationWindow.y,
  )

  context.drawImage(
    frame,
    0,
    sourceWindow.y,
    sourceWindow.x,
    sourceWindow.height,
    0,
    destinationWindow.y,
    destinationWindow.x,
    destinationWindow.height,
  )

  context.drawImage(
    frame,
    sourceRightX,
    sourceWindow.y,
    frame.width - sourceRightX,
    sourceWindow.height,
    destinationRightX,
    destinationWindow.y,
    outputWidth - destinationRightX,
    destinationWindow.height,
  )

  context.drawImage(
    frame,
    0,
    sourceBottomY,
    frame.width,
    frame.height - sourceBottomY,
    0,
    destinationBottomY,
    outputWidth,
    outputHeight - destinationBottomY,
  )
}

export function preloadPrintFrame() {
  return loadFrameImage().then(() => undefined)
}

export async function composePrintablePhoto(
  photo: Blob,
  options: ComposePrintablePhotoOptions = {},
) {
  const createCanvas = options.createCanvas ?? (() => document.createElement('canvas'))
  const canvasToBlob = options.canvasToBlob ?? createCanvasBlob
  const loadFrame = options.loadFrame ?? loadFrameImage
  const loadPhoto = options.loadPhoto ?? loadPhotoImage

  const canvas = createCanvas()
  canvas.width = outputWidth
  canvas.height = outputHeight

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('No pudimos preparar el lienzo de impresion.')
  }

  const [frame, photoImage] = await Promise.all([loadFrame(), loadPhoto(photo)])
  const destinationWindow = getWindowRect(outputWidth, outputHeight)
  const sourceWindow = getWindowRect(frame.width, frame.height)
  const photoPlacement = getCoverPlacement(photoImage.width, photoImage.height, destinationWindow)

  context.save()
  context.beginPath()
  context.rect(
    destinationWindow.x,
    destinationWindow.y,
    destinationWindow.width,
    destinationWindow.height,
  )
  context.clip()
  context.drawImage(
    photoImage,
    photoPlacement.x,
    photoPlacement.y,
    photoPlacement.width,
    photoPlacement.height,
  )
  context.restore()

  drawFrameBands(context, frame, sourceWindow, destinationWindow)

  return canvasToBlob(canvas, 'image/jpeg', 0.92)
}

export const printCompositionConfig = {
  outputHeight,
  outputWidth,
}

export const printWindow = {
  getRect: getWindowRect,
  normalized: frameWindow,
  getCoverPlacement,
}
