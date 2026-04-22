import { assign, fromPromise, setup } from 'xstate';

import { kioskConfig } from './config';
import { printerAdapter } from './printer';
import type {
  CameraErrorDetails,
  CapturedPhoto,
  FlowState,
  KioskConfig,
  PhotoSession,
  PrinterAdapter,
  PrinterResult,
} from './types';

interface KioskContext extends PhotoSession {
  countdownValue: number;
  printJobId: string | null;
}

type KioskEvent =
  | { type: 'BEGIN' }
  | { type: 'BACK' }
  | { type: 'RETRY' }
  | { type: 'HOME' }
  | { type: 'IDLE_TIMEOUT' }
  | { type: 'ACCEPT_CONSENT'; accepted: boolean }
  | { type: 'CONTINUE' }
  | { type: 'START_COUNTDOWN' }
  | { type: 'PHOTO_CAPTURED'; photo: CapturedPhoto }
  | { type: 'RETAKE' }
  | { type: 'CONFIRM_PRINT' }
  | { type: 'CAMERA_FAILURE'; error: CameraErrorDetails }
  | { type: 'RESET' };

interface MachineOptions {
  config?: KioskConfig;
  printer?: PrinterAdapter;
}

function createInitialContext(config: KioskConfig): KioskContext {
  return {
    consentAccepted: false,
    capturedBlob: null,
    printableBlob: null,
    capturedUrl: null,
    captureTs: null,
    cameraError: undefined,
    countdownValue: config.countdownSeconds,
    printJobId: null,
  };
}

function revokeObjectUrl(url: string | null) {
  if (url) {
    URL.revokeObjectURL(url);
  }
}

export function createKioskMachine(options: MachineOptions = {}) {
  const config = options.config ?? kioskConfig;
  const printer = options.printer ?? printerAdapter;

  return setup({
    types: {
      context: {} as KioskContext,
      events: {} as KioskEvent,
      output: {} as PrinterResult,
    },
    actors: {
      printPhoto: fromPromise(
        async ({
          input,
        }: {
          input: { printer: PrinterAdapter; photo: Blob; createdAt: number };
        }) =>
          input.printer.print({
            photo: input.photo,
            createdAt: input.createdAt,
          }),
      ),
    },
    guards: {
      consentAccepted: ({ context }) => context.consentAccepted,
      hasPhoto: ({ context }) => Boolean(context.capturedBlob && context.capturedUrl),
      lastCountdownSecond: ({ context }) => context.countdownValue <= 1,
    },
    actions: {
      resetSession: assign(({ context }) => {
        revokeObjectUrl(context.capturedUrl);
        return createInitialContext(config);
      }),
      setConsentAccepted: assign({
        consentAccepted: ({ event }) =>
          event.type === 'ACCEPT_CONSENT' ? event.accepted : false,
      }),
      clearCameraError: assign({
        cameraError: () => undefined,
      }),
      setCameraError: assign({
        cameraError: ({ event }) =>
          event.type === 'CAMERA_FAILURE' ? event.error : undefined,
      }),
      seedCountdown: assign({
        countdownValue: () => config.countdownSeconds,
      }),
      decrementCountdown: assign({
        countdownValue: ({ context }) => Math.max(1, context.countdownValue - 1),
      }),
      clearCapturedPhoto: assign(({ context }) => {
        revokeObjectUrl(context.capturedUrl);
        return {
          capturedBlob: null,
          printableBlob: null,
          capturedUrl: null,
          captureTs: null,
          countdownValue: config.countdownSeconds,
          printJobId: null,
        };
      }),
      storeCapturedPhoto: assign(({ context, event }) => {
        if (event.type !== 'PHOTO_CAPTURED') {
          return {};
        }

        revokeObjectUrl(context.capturedUrl);

        return {
          capturedBlob: event.photo.blob,
          printableBlob: event.photo.printableBlob,
          capturedUrl: event.photo.url,
          captureTs: event.photo.createdAt,
          cameraError: undefined,
          printJobId: null,
        };
      }),
    },
  }).createMachine({
    id: 'kiosk',
    initial: 'home',
    context: createInitialContext(config),
    on: {
      RESET: {
        target: '.home',
        actions: 'resetSession',
      },
    },
    states: {
      home: {
        on: {
          BEGIN: 'consent',
        },
      },
      consent: {
        on: {
          ACCEPT_CONSENT: {
            actions: 'setConsentAccepted',
          },
          CONTINUE: {
            guard: 'consentAccepted',
            target: 'camera',
          },
          BACK: 'home',
          IDLE_TIMEOUT: {
            target: 'home',
            actions: 'resetSession',
          },
        },
      },
      camera: {
        entry: 'clearCameraError',
        on: {
          START_COUNTDOWN: 'countdown',
          BACK: 'consent',
          CAMERA_FAILURE: {
            target: 'cameraError',
            actions: 'setCameraError',
          },
          IDLE_TIMEOUT: {
            target: 'home',
            actions: 'resetSession',
          },
        },
      },
      countdown: {
        entry: 'seedCountdown',
        on: {
          CAMERA_FAILURE: {
            target: 'cameraError',
            actions: 'setCameraError',
          },
          PHOTO_CAPTURED: {
            target: 'review',
            actions: 'storeCapturedPhoto',
          },
        },
        initial: 'ticking',
        states: {
          ticking: {
            after: {
              1000: [
                {
                  guard: 'lastCountdownSecond',
                  target: 'capturing',
                },
                {
                  actions: 'decrementCountdown',
                  reenter: true,
                  target: 'ticking',
                },
              ],
            },
          },
          capturing: {},
        },
      },
      review: {
        on: {
          RETAKE: {
            target: 'camera',
            actions: 'clearCapturedPhoto',
          },
          CONFIRM_PRINT: {
            guard: 'hasPhoto',
            target: 'printing',
          },
          IDLE_TIMEOUT: {
            target: 'home',
            actions: 'resetSession',
          },
        },
      },
      printing: {
        invoke: {
          id: 'printPhoto',
          src: 'printPhoto',
          input: ({ context }) => ({
            printer,
            photo: context.printableBlob ?? (context.capturedBlob as Blob),
            createdAt: context.captureTs ?? Date.now(),
          }),
          onDone: {
            actions: assign({
              printJobId: ({ event }) => event.output.jobId,
            }),
          },
        },
        after: {
          [config.printingMs]: {
            target: 'home',
            actions: 'resetSession',
          },
        },
      },
      cameraError: {
        on: {
          RETRY: {
            target: 'camera',
            actions: 'clearCameraError',
          },
          HOME: {
            target: 'home',
            actions: 'resetSession',
          },
          IDLE_TIMEOUT: {
            target: 'home',
            actions: 'resetSession',
          },
        },
      },
    },
  });
}

export const kioskMachine = createKioskMachine();

type MatchableState = FlowState | { countdown?: 'ticking' | 'capturing' };

export function getFlowState(snapshot: { matches: (value: MatchableState) => boolean }): FlowState {
  if (snapshot.matches('cameraError')) {
    return 'cameraError';
  }

  if (snapshot.matches('printing')) {
    return 'printing';
  }

  if (snapshot.matches('review')) {
    return 'review';
  }

  if (snapshot.matches('countdown')) {
    return 'countdown';
  }

  if (snapshot.matches('camera')) {
    return 'camera';
  }

  if (snapshot.matches('consent')) {
    return 'consent';
  }

  return 'home';
}
