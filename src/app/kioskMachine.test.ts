import { createActor } from 'xstate';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createKioskMachine, getFlowState } from './kioskMachine';
import type { CapturedPhoto, PrinterAdapter } from './types';

const testPrinter: PrinterAdapter = {
  print: vi.fn(async ({ createdAt }) => ({
    jobId: `job-${createdAt}`,
    status: 'simulated' as const,
  })),
};

function createCapturedPhoto(overrides: Partial<CapturedPhoto> = {}): CapturedPhoto {
  const blob = overrides.blob ?? new Blob(['frame'], { type: 'image/jpeg' });

  return {
    blob,
    printableBlob: overrides.printableBlob ?? blob,
    url: overrides.url ?? 'blob:captured',
    createdAt: overrides.createdAt ?? 123,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('kioskMachine', () => {
  it('requires consent before continuing to the camera', () => {
    const actor = createActor(
      createKioskMachine({
        printer: testPrinter,
      }),
    );

    actor.start();
    actor.send({ type: 'BEGIN' });
    actor.send({ type: 'CONTINUE' });

    expect(getFlowState(actor.getSnapshot())).toBe('consent');

    actor.send({ type: 'ACCEPT_CONSENT', accepted: true });
    actor.send({ type: 'CONTINUE' });

    expect(getFlowState(actor.getSnapshot())).toBe('camera');
  });

  it('advances through the countdown and stores the captured photo', async () => {
    vi.useFakeTimers();

    const actor = createActor(
      createKioskMachine({
        config: {
          idleMs: 30_000,
          countdownSeconds: 3,
          printingMs: 500,
        },
        printer: testPrinter,
      }),
    );

    actor.start();
    actor.send({ type: 'BEGIN' });
    actor.send({ type: 'ACCEPT_CONSENT', accepted: true });
    actor.send({ type: 'CONTINUE' });
    actor.send({ type: 'START_COUNTDOWN' });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(actor.getSnapshot().context.countdownValue).toBe(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(actor.getSnapshot().matches({ countdown: 'capturing' })).toBe(true);

    const photo = createCapturedPhoto();

    actor.send({ type: 'PHOTO_CAPTURED', photo });

    expect(getFlowState(actor.getSnapshot())).toBe('review');
    expect(actor.getSnapshot().context.capturedUrl).toBe('blob:captured');
    expect(actor.getSnapshot().context.printableBlob).toBe(photo.printableBlob);
  });

  it('clears the current object URL when retaking or resetting', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const actor = createActor(createKioskMachine({ printer: testPrinter }));

    actor.start();
    actor.send({ type: 'BEGIN' });
    actor.send({ type: 'ACCEPT_CONSENT', accepted: true });
    actor.send({ type: 'CONTINUE' });
    actor.send({ type: 'START_COUNTDOWN' });
    actor.send({
      type: 'PHOTO_CAPTURED',
      photo: createCapturedPhoto({
        blob: new Blob(['frame']),
        printableBlob: new Blob(['print-frame']),
        url: 'blob:existing',
        createdAt: 123,
      }),
    });

    actor.send({ type: 'RETAKE' });
    expect(revokeSpy).toHaveBeenCalledWith('blob:existing');
    expect(actor.getSnapshot().context.printableBlob).toBeNull();

    actor.send({ type: 'START_COUNTDOWN' });
    actor.send({
      type: 'PHOTO_CAPTURED',
      photo: createCapturedPhoto({
        blob: new Blob(['frame']),
        printableBlob: new Blob(['print-frame']),
        url: 'blob:second',
        createdAt: 456,
      }),
    });
    actor.send({ type: 'IDLE_TIMEOUT' });

    expect(revokeSpy).toHaveBeenCalledWith('blob:second');
    expect(getFlowState(actor.getSnapshot())).toBe('home');
    expect(actor.getSnapshot().context.printableBlob).toBeNull();
  });

  it('prints the printable blob instead of the original capture when available', async () => {
    const printer: PrinterAdapter = {
      print: vi.fn(async ({ createdAt }) => ({
        jobId: `job-${createdAt}`,
        status: 'simulated' as const,
      })),
    };
    const actor = createActor(createKioskMachine({ printer }));
    const originalBlob = new Blob(['frame'], { type: 'image/jpeg' });
    const printableBlob = new Blob(['print-frame'], { type: 'image/jpeg' });

    actor.start();
    actor.send({ type: 'BEGIN' });
    actor.send({ type: 'ACCEPT_CONSENT', accepted: true });
    actor.send({ type: 'CONTINUE' });
    actor.send({ type: 'START_COUNTDOWN' });
    actor.send({
      type: 'PHOTO_CAPTURED',
      photo: createCapturedPhoto({
        blob: originalBlob,
        printableBlob,
      }),
    });
    actor.send({ type: 'CONFIRM_PRINT' });

    await vi.waitFor(() => {
      expect(printer.print).toHaveBeenCalledWith({
        createdAt: 123,
        photo: printableBlob,
      });
    });
  });
});
