import { describe, expect, it, vi } from 'vitest';

import { archiveConfirmedPhoto, type PhotoArchiveClient } from './photoArchive';

function createArchiveClient() {
  const upload = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({
    error: null,
  }));
  const getPublicUrl = vi.fn((path: string) => ({
    data: {
      publicUrl: `https://example.supabase.co/storage/v1/object/public/kiosk-photos/${path}`,
    },
  }));
  const remove = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({
    error: null,
  }));
  const insert = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({
    error: null,
  }));

  const client: PhotoArchiveClient = {
    storage: {
      from: vi.fn(() => ({
        upload,
        getPublicUrl,
        remove,
      })),
    },
    from: vi.fn(() => ({
      insert,
    })),
  };

  return {
    client,
    mocks: {
      getPublicUrl,
      insert,
      remove,
      upload,
    },
  };
}

describe('archiveConfirmedPhoto', () => {
  it('uploads the image and stores its public URL in the database', async () => {
    const { client, mocks } = createArchiveClient();
    const photo = new Blob(['frame'], { type: 'image/jpeg' });

    const result = await archiveConfirmedPhoto(photo, {
      bucketName: 'kiosk-photos',
      client,
      now: () => 123,
      randomUUID: () => 'uuid-1',
    });

    expect(mocks.upload).toHaveBeenCalledWith('photos/123-uuid-1.jpg', photo, {
      contentType: 'image/jpeg',
      upsert: false,
    });
    expect(mocks.insert).toHaveBeenCalledWith({
      image_url:
        'https://example.supabase.co/storage/v1/object/public/kiosk-photos/photos/123-uuid-1.jpg',
    });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(result).toEqual({
      imageUrl:
        'https://example.supabase.co/storage/v1/object/public/kiosk-photos/photos/123-uuid-1.jpg',
    });
  });

  it('does not insert a database record when the upload fails', async () => {
    const { client, mocks } = createArchiveClient();
    mocks.upload.mockResolvedValueOnce({
      error: {
        message: 'upload exploded',
      },
    });

    await expect(
      archiveConfirmedPhoto(new Blob(['frame'], { type: 'image/jpeg' }), {
        client,
      }),
    ).rejects.toThrow('Photo upload failed: upload exploded');

    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('removes the uploaded file if the database insert fails', async () => {
    const { client, mocks } = createArchiveClient();
    mocks.insert.mockResolvedValueOnce({
      error: {
        message: 'insert exploded',
      },
    });

    await expect(
      archiveConfirmedPhoto(new Blob(['frame'], { type: 'image/jpeg' }), {
        bucketName: 'kiosk-photos',
        client,
        now: () => 456,
        randomUUID: () => 'uuid-2',
      }),
    ).rejects.toThrow('Photo archive insert failed: insert exploded');

    expect(mocks.remove).toHaveBeenCalledWith(['photos/456-uuid-2.jpg']);
  });
});
