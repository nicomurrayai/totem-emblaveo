import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./app/photoArchive', () => ({
  archiveConfirmedPhoto: vi.fn(async () => ({
    imageUrl: 'https://example.supabase.co/storage/v1/object/public/kiosk-photos/mock.jpg',
    imageToPrintUrl:
      'https://example.supabase.co/storage/v1/object/public/kiosk-photos/print/mock.jpg',
  })),
}));

vi.mock('./app/printComposition', () => ({
  composePrintablePhoto: vi.fn(async () => new Blob(['print-ready'], { type: 'image/jpeg' })),
  preloadPrintFrame: vi.fn(async () => undefined),
}));

import App from './App';
import { archiveConfirmedPhoto } from './app/photoArchive';
import { composePrintablePhoto } from './app/printComposition';

const archiveConfirmedPhotoMock = vi.mocked(archiveConfirmedPhoto);
const composePrintablePhotoMock = vi.mocked(composePrintablePhoto);

function createMockStream() {
  const track = {
    stop: vi.fn(),
  };

  return {
    getTracks: () => [track],
  } as unknown as MediaStream;
}

function mockMediaDevices(implementation: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(implementation),
    },
  });

  return navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>;
}

async function goToConsent(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Participar' }));
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Continuar' }));
}

describe('App', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('completes the capture and simulated printing flow', async () => {
    const getUserMedia = mockMediaDevices(async () => createMockStream());
    const user = userEvent.setup();
    const playMock = HTMLMediaElement.prototype.play as unknown as ReturnType<typeof vi.fn>;

    render(<App />);
    await goToConsent(user);

    expect(await screen.findByText(/Tomate 5 segundos/i)).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Tomar foto' }));
    expect(
      await screen.findByText(/Revisá tu foto/i, undefined, { timeout: 7_000 }),
    ).toBeInTheDocument();
    expect(playMock.mock.calls.length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText(/Tu foto se está imprimiendo/i)).toBeInTheDocument();

    await waitFor(
      () =>
        expect(
          screen.getByRole('button', { name: 'Participar' }),
        ).toBeInTheDocument(),
      { timeout: 5_500 },
    );
  }, 15_000);

  it('archives the confirmed photo without blocking the printing flow', async () => {
    const printableBlob = new Blob(['print-ready'], { type: 'image/jpeg' });
    composePrintablePhotoMock.mockResolvedValueOnce(printableBlob);
    archiveConfirmedPhotoMock.mockResolvedValueOnce({
      imageUrl: 'https://example.supabase.co/storage/v1/object/public/kiosk-photos/confirmed.jpg',
      imageToPrintUrl:
        'https://example.supabase.co/storage/v1/object/public/kiosk-photos/print/confirmed.jpg',
    });

    mockMediaDevices(async () => createMockStream());
    const user = userEvent.setup();

    render(<App />);
    await goToConsent(user);
    await user.click(screen.getByRole('button', { name: 'Tomar foto' }));
    await screen.findByRole('heading', { name: /Revis/i }, { timeout: 7_000 });
    const reviewPhoto = screen.getByAltText('Foto capturada');

    expect(reviewPhoto).toHaveAttribute('src', 'blob:mock-photo');

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => {
      expect(archiveConfirmedPhotoMock).toHaveBeenCalledTimes(1);
      expect(archiveConfirmedPhotoMock).toHaveBeenCalledWith({
        originalPhoto: expect.any(Blob),
        printablePhoto: printableBlob,
      });
    });
    expect(await screen.findByRole('heading', { name: /imprimiendo/i })).toBeInTheDocument();
    expect(screen.getByAltText('Vista previa de impresión')).toHaveAttribute('src', 'blob:mock-photo');
  }, 15_000);

  it('does not archive discarded photos when the user chooses to retake', async () => {
    mockMediaDevices(async () => createMockStream());
    const user = userEvent.setup();

    render(<App />);
    await goToConsent(user);
    await user.click(screen.getByRole('button', { name: 'Tomar foto' }));
    await screen.findByRole('heading', { name: /Revis/i }, { timeout: 7_000 });

    await user.click(screen.getByRole('button', { name: 'Repetir' }));

    expect(await screen.findByRole('heading', { name: /Busc/i })).toBeInTheDocument();
    expect(archiveConfirmedPhotoMock).not.toHaveBeenCalled();
  }, 15_000);

  it('keeps printing even if archiving the photo fails', async () => {
    archiveConfirmedPhotoMock.mockRejectedValueOnce(new Error('upload failed'));

    mockMediaDevices(async () => createMockStream());
    const user = userEvent.setup();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<App />);
    await goToConsent(user);
    await user.click(screen.getByRole('button', { name: 'Tomar foto' }));
    await screen.findByRole('heading', { name: /Revis/i }, { timeout: 7_000 });

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByRole('heading', { name: /imprimiendo/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(archiveConfirmedPhotoMock).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
    consoleErrorSpy.mockRestore();
  }, 15_000);

  it('falls back to the original blob when the print composition fails', async () => {
    composePrintablePhotoMock.mockRejectedValueOnce(new Error('frame failed'));

    mockMediaDevices(async () => createMockStream());
    const user = userEvent.setup();

    render(<App />);
    await goToConsent(user);
    await user.click(screen.getByRole('button', { name: 'Tomar foto' }));
    await screen.findByRole('heading', { name: /Revis/i }, { timeout: 7_000 });

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => {
      expect(archiveConfirmedPhotoMock).toHaveBeenCalledTimes(1);
    });

    const archiveCall = archiveConfirmedPhotoMock.mock.calls[0]?.[0];

    expect(archiveCall?.originalPhoto).toBeInstanceOf(Blob);
    expect(archiveCall?.printablePhoto).toBe(archiveCall?.originalPhoto);
    expect(await screen.findByRole('heading', { name: /imprimiendo/i })).toBeInTheDocument();
  }, 15_000);

  it('shows a permission error when the browser blocks the camera', async () => {
    mockMediaDevices(async () => {
      throw Object.assign(new Error('blocked'), { name: 'NotAllowedError' });
    });

    const user = userEvent.setup();

    render(<App />);
    await goToConsent(user);

    expect(await screen.findByText(/No pudimos acceder a la cámara/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('shows a missing-device error when no webcam is available', async () => {
    mockMediaDevices(async () => {
      throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
    });

    const user = userEvent.setup();

    render(<App />);
    await goToConsent(user);

    expect(await screen.findByText(/No encontramos una cámara disponible/i)).toBeInTheDocument();
  });
});
