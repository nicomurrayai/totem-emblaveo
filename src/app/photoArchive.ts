import { getSupabaseBucketName, getSupabaseClient } from './supabase';
import type { ArchivedPhotoRecord } from './types';

interface ArchiveClientError {
  message: string;
}

interface PhotoStorageBucket {
  upload(
    path: string,
    file: Blob,
    options: {
      contentType: string;
      upsert: boolean;
    },
  ): Promise<{ error: ArchiveClientError | null }>;
  getPublicUrl(path: string): { data: { publicUrl: string } };
  remove(paths: string[]): Promise<{ error: ArchiveClientError | null }>;
}

export interface PhotoArchiveClient {
  storage: {
    from(bucketName: string): PhotoStorageBucket;
  };
  from(tableName: 'kiosk_photos'): {
    insert(
      values: Pick<ArchivedPhotoRecord, 'image_url' | 'image_to_print_url'>,
    ): Promise<{ error: ArchiveClientError | null }>;
  };
}

interface ArchiveConfirmedPhotoOptions {
  bucketName?: string;
  client?: PhotoArchiveClient;
  now?: () => number;
  randomUUID?: () => string;
}

function getFileExtension(photo: Blob) {
  switch (photo.type) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpg';
  }
}

function createOriginalPhotoPath(photo: Blob, fileId: string) {
  return `photos/${fileId}.${getFileExtension(photo)}`;
}

function createPrintablePhotoPath(fileId: string) {
  return `photos/print/${fileId}.jpg`;
}

async function cleanupUploadedPhotos(bucket: PhotoStorageBucket, paths: string[]) {
  if (paths.length === 0) {
    return;
  }

  await bucket.remove(paths);
}

export async function archiveConfirmedPhoto(
  {
    originalPhoto,
    printablePhoto,
  }: {
    originalPhoto: Blob;
    printablePhoto: Blob;
  },
  options: ArchiveConfirmedPhotoOptions = {},
): Promise<{ imageUrl: string; imageToPrintUrl: string }> {
  const client = (options.client ?? getSupabaseClient()) as PhotoArchiveClient;
  const bucketName = options.bucketName ?? getSupabaseBucketName();
  const now = options.now ?? Date.now;
  const randomUUID = options.randomUUID ?? (() => crypto.randomUUID());
  const fileId = `${now()}-${randomUUID()}`;

  const originalPath = createOriginalPhotoPath(originalPhoto, fileId);
  const printablePath = createPrintablePhotoPath(fileId);
  const bucket = client.storage.from(bucketName);
  const { error: originalUploadError } = await bucket.upload(originalPath, originalPhoto, {
    contentType: originalPhoto.type || 'image/jpeg',
    upsert: false,
  });

  if (originalUploadError) {
    throw new Error(`Photo upload failed: ${originalUploadError.message}`);
  }

  const {
    data: { publicUrl: imageUrl },
  } = bucket.getPublicUrl(originalPath);

  if (!imageUrl) {
    await cleanupUploadedPhotos(bucket, [originalPath]);
    throw new Error('Photo upload succeeded but no public URL was returned.');
  }

  const { error: printableUploadError } = await bucket.upload(printablePath, printablePhoto, {
    contentType: printablePhoto.type || 'image/jpeg',
    upsert: false,
  });

  if (printableUploadError) {
    await cleanupUploadedPhotos(bucket, [originalPath]);
    throw new Error(`Printable photo upload failed: ${printableUploadError.message}`);
  }

  const {
    data: { publicUrl: imageToPrintUrl },
  } = bucket.getPublicUrl(printablePath);

  if (!imageToPrintUrl) {
    await cleanupUploadedPhotos(bucket, [originalPath, printablePath]);
    throw new Error('Photo upload succeeded but no public URL was returned.');
  }

  const { error: insertError } = await client.from('kiosk_photos').insert({
    image_url: imageUrl,
    image_to_print_url: imageToPrintUrl,
  });

  if (insertError) {
    await cleanupUploadedPhotos(bucket, [originalPath, printablePath]);
    throw new Error(`Photo archive insert failed: ${insertError.message}`);
  }

  return {
    imageUrl,
    imageToPrintUrl,
  };
}
