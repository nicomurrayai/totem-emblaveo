import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from './App';

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
