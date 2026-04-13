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
    insert(values: Pick<ArchivedPhotoRecord, 'image_url'>): Promise<{ error: ArchiveClientError | null }>;
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

function createPhotoPath(photo: Blob, now: () => number, randomUUID: () => string) {
  return `photos/${now()}-${randomUUID()}.${getFileExtension(photo)}`;
}

async function cleanupUploadedPhoto(bucket: PhotoStorageBucket, path: string) {
  await bucket.remove([path]);
}

export async function archiveConfirmedPhoto(
  photo: Blob,
  options: ArchiveConfirmedPhotoOptions = {},
): Promise<{ imageUrl: string }> {
  const client = (options.client ?? getSupabaseClient()) as PhotoArchiveClient;
  const bucketName = options.bucketName ?? getSupabaseBucketName();
  const now = options.now ?? Date.now;
  const randomUUID = options.randomUUID ?? (() => crypto.randomUUID());

  const storagePath = createPhotoPath(photo, now, randomUUID);
  const bucket = client.storage.from(bucketName);
  const contentType = photo.type || 'image/jpeg';
  const { error: uploadError } = await bucket.upload(storagePath, photo, {
    contentType,
    upsert: false,
  });

  if (uploadError) {
    throw new Error(`Photo upload failed: ${uploadError.message}`);
  }

  const {
    data: { publicUrl },
  } = bucket.getPublicUrl(storagePath);

  if (!publicUrl) {
    await cleanupUploadedPhoto(bucket, storagePath);
    throw new Error('Photo upload succeeded but no public URL was returned.');
  }

  const { error: insertError } = await client.from('kiosk_photos').insert({
    image_url: publicUrl,
  });

  if (insertError) {
    await cleanupUploadedPhoto(bucket, storagePath);
    throw new Error(`Photo archive insert failed: ${insertError.message}`);
  }

  return {
    imageUrl: publicUrl,
  };
}
