import type { CameraErrorDetails, CapturedPhoto } from './types';

const defaultCaptureWidth = 1080;
const defaultCaptureHeight = 1440;

function createCameraError(code: CameraErrorDetails['code'], message: string): CameraErrorDetails {
  return { code, message };
}

export function normalizeCameraError(error: unknown): CameraErrorDetails {
  const fallback = createCameraError(
    'stream-failed',
    'No pudimos iniciar la cámara. Probá de nuevo en unos segundos.',
  );

  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    'message' in error &&
    typeof error.code === 'string' &&
    typeof error.message === 'string'
  ) {
    return error as CameraErrorDetails;
  }

  if (!error || typeof error !== 'object') {
    return fallback;
  }

  const maybeError = error as { name?: string };

  switch (maybeError.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return createCameraError(
        'permission-denied',
        'No pudimos acceder a la cámara. Revisá los permisos del navegador o del modo kiosco.',
      );
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return createCameraError(
        'no-device',
        'No encontramos una cámara disponible en este tótem.',
      );
    case 'NotReadableError':
    case 'AbortError':
    case 'TrackStartError':
      return createCameraError(
        'stream-failed',
        'La cámara está ocupada o no respondió como esperábamos. Intentá nuevamente.',
      );
    default:
      return fallback;
  }
}

export async function getDefaultCameraStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw createCameraError(
      'no-device',
      'Este navegador no tiene acceso a la cámara del tótem.',
    );
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: defaultCaptureWidth },
        height: { ideal: defaultCaptureHeight },
      },
    });
  } catch (error) {
    throw normalizeCameraError(error);
  }
}

export function stopCameraStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function capturePhoto(video: HTMLVideoElement): Promise<CapturedPhoto> {
  const width = video.videoWidth || defaultCaptureWidth;
  const height = video.videoHeight || defaultCaptureHeight;

  if (!width || !height) {
    throw createCameraError(
      'capture-failed',
      'La cámara todavía no estaba lista para tomar la foto.',
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');

  if (!context) {
    throw createCameraError(
      'capture-failed',
      'No pudimos preparar la captura de la foto.',
    );
  }

  context.drawImage(video, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result);
          return;
        }

        reject(
          createCameraError(
            'capture-failed',
            'No pudimos generar la imagen capturada. Intentá nuevamente.',
          ),
        );
      },
      'image/jpeg',
      0.92,
    );
  });

  return {
    blob,
    url: URL.createObjectURL(blob),
    createdAt: Date.now(),
  };
}
