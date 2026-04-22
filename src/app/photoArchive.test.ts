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
  it('uploads both images and stores both public URLs in the database', async () => {
    const { client, mocks } = createArchiveClient();
    const originalPhoto = new Blob(['frame'], { type: 'image/png' });
    const printablePhoto = new Blob(['print-frame'], { type: 'image/jpeg' });

    const result = await archiveConfirmedPhoto({ originalPhoto, printablePhoto }, {
      bucketName: 'kiosk-photos',
      client,
      now: () => 123,
      randomUUID: () => 'uuid-1',
    });

    expect(mocks.upload).toHaveBeenNthCalledWith(1, 'photos/123-uuid-1.png', originalPhoto, {
      contentType: 'image/png',
      upsert: false,
    });
    expect(mocks.upload).toHaveBeenNthCalledWith(
      2,
      'photos/print/123-uuid-1.jpg',
      printablePhoto,
      {
        contentType: 'image/jpeg',
        upsert: false,
      },
    );
    expect(mocks.insert).toHaveBeenCalledWith({
      image_url:
        'https://example.supabase.co/storage/v1/object/public/kiosk-photos/photos/123-uuid-1.png',
      image_to_print_url:
        'https://example.supabase.co/storage/v1/object/public/kiosk-photos/photos/print/123-uuid-1.jpg',
    });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(result).toEqual({
      imageUrl:
        'https://example.supabase.co/storage/v1/object/public/kiosk-photos/photos/123-uuid-1.png',
      imageToPrintUrl:
        'https://example.supabase.co/storage/v1/object/public/kiosk-photos/photos/print/123-uuid-1.jpg',
    });
  });

  it('does not insert a database record when the original upload fails', async () => {
    const { client, mocks } = createArchiveClient();
    mocks.upload.mockResolvedValueOnce({
      error: {
        message: 'upload exploded',
      },
    });

    await expect(
      archiveConfirmedPhoto(
        {
          originalPhoto: new Blob(['frame'], { type: 'image/jpeg' }),
          printablePhoto: new Blob(['print-frame'], { type: 'image/jpeg' }),
        },
        {
          client,
        },
      ),
    ).rejects.toThrow('Photo upload failed: upload exploded');

    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('removes the original upload if the printable upload fails', async () => {
    const { client, mocks } = createArchiveClient();
    mocks.upload
      .mockResolvedValueOnce({
        error: null,
      })
      .mockResolvedValueOnce({
        error: {
          message: 'printable exploded',
        },
      });

    await expect(
      archiveConfirmedPhoto(
        {
          originalPhoto: new Blob(['frame'], { type: 'image/jpeg' }),
          printablePhoto: new Blob(['print-frame'], { type: 'image/jpeg' }),
        },
        {
          bucketName: 'kiosk-photos',
          client,
          now: () => 456,
          randomUUID: () => 'uuid-2',
        },
      ),
    ).rejects.toThrow('Printable photo upload failed: printable exploded');

    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledWith(['photos/456-uuid-2.jpg']);
  });

  it('removes both uploaded files if the database insert fails', async () => {
    const { client, mocks } = createArchiveClient();
    mocks.insert.mockResolvedValueOnce({
      error: {
        message: 'insert exploded',
      },
    });

    await expect(
      archiveConfirmedPhoto(
        {
          originalPhoto: new Blob(['frame'], { type: 'image/jpeg' }),
          printablePhoto: new Blob(['print-frame'], { type: 'image/jpeg' }),
        },
        {
          bucketName: 'kiosk-photos',
          client,
          now: () => 789,
          randomUUID: () => 'uuid-3',
        },
      ),
    ).rejects.toThrow('Photo archive insert failed: insert exploded');

    expect(mocks.remove).toHaveBeenCalledWith([
      'photos/789-uuid-3.jpg',
      'photos/print/789-uuid-3.jpg',
    ]);
  });
});
