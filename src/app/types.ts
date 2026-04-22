export type FlowState =
  | 'home'
  | 'consent'
  | 'camera'
  | 'countdown'
  | 'review'
  | 'printing'
  | 'cameraError';

export type CameraErrorCode =
  | 'permission-denied'
  | 'no-device'
  | 'stream-failed'
  | 'capture-failed';

export interface CameraErrorDetails {
  code: CameraErrorCode;
  message: string;
}

export interface PhotoSession {
  consentAccepted: boolean;
  capturedBlob: Blob | null;
  printableBlob: Blob | null;
  capturedUrl: string | null;
  captureTs: number | null;
  cameraError?: CameraErrorDetails;
}

export interface KioskConfig {
  idleMs: number;
  countdownSeconds: number;
  printingMs: number;
}

export interface PrinterJob {
  photo: Blob;
  createdAt: number;
}

export interface PrinterResult {
  jobId: string;
  status: 'queued' | 'simulated';
}

export interface PrinterAdapter {
  print(job: PrinterJob): Promise<PrinterResult>;
}

export interface CapturedPhoto {
  blob: Blob;
  printableBlob: Blob;
  url: string;
  createdAt: number;
}

export interface ArchivedPhotoRecord {
  id: string;
  image_url: string;
  image_to_print_url: string | null;
  created_at: string;
}
