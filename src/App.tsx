import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useMachine } from '@xstate/react';

import logoPrimary from './assets/logo-primary.png';
import pfizerLogo from './assets/pfizer-logo.png';
import './App.css';
import { kioskConfig, resetsOnIdle } from './app/config';
import {
  capturePhoto,
  getDefaultCameraStream,
  normalizeCameraError,
  stopCameraStream,
} from './app/camera';
import { getFlowState, kioskMachine } from './app/kioskMachine';
import type { CameraErrorDetails, FlowState } from './app/types';

function useCameraController(active: boolean, onError: (error: CameraErrorDetails) => void) {
  const [isReady, setIsReady] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onErrorRef = useRef(onError);

  onErrorRef.current = onError;

  const attachStreamToVideo = useCallback(async (video: HTMLVideoElement, stream: MediaStream) => {
    setIsReady(false);
    (video as HTMLVideoElement & { srcObject: MediaStream | null }).srcObject = stream;

    try {
      await video.play();
    } catch {
      // Some kiosk browsers resolve the stream but reject autoplay promises.
    }

    setIsReady(true);
  }, []);

  const setVideoElement = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;

      if (node && streamRef.current) {
        void attachStreamToVideo(node, streamRef.current);
      }
    },
    [attachStreamToVideo],
  );

  useEffect(() => {
    let cancelled = false;

    async function attachStream(stream: MediaStream) {
      const video = videoRef.current;

      if (!video) {
        return;
      }

      await attachStreamToVideo(video, stream);

      if (!cancelled) {
        setIsReady(true);
      }
    }

    function releaseStream() {
      stopCameraStream(streamRef.current);
      streamRef.current = null;

      const video = videoRef.current;
      if (video) {
        video.pause();
        (video as HTMLVideoElement & { srcObject: MediaStream | null }).srcObject = null;
      }

      setIsReady(false);
      setIsStarting(false);
    }

    async function startStream() {
      if (streamRef.current) {
        await attachStream(streamRef.current);
        return;
      }

      setIsStarting(true);

      try {
        const stream = await getDefaultCameraStream();

        if (cancelled) {
          stopCameraStream(stream);
          return;
        }

        streamRef.current = stream;
        await attachStream(stream);
      } catch (error) {
        if (!cancelled) {
          onErrorRef.current(normalizeCameraError(error));
        }
        releaseStream();
      } finally {
        if (!cancelled) {
          setIsStarting(false);
        }
      }
    }

    if (active) {
      void startStream();
    } else {
      releaseStream();
    }

    return () => {
      cancelled = true;
      releaseStream();
    };
  }, [active, attachStreamToVideo]);

  async function takePhoto() {
    const video = videoRef.current;

    if (!video) {
      throw normalizeCameraError({
        name: 'AbortError',
      });
    }

    return capturePhoto(video);
  }

  return {
    capture: takePhoto,
    isReady,
    isStarting,
    videoRef: setVideoElement,
  };
}

function BrandMark() {
  return (
    <div className="brand-mark brand-mark--fixed">
      <img alt="EMBLAVEO" src={logoPrimary} />
    </div>
  );
}

function PfizerMark() {
  return (
    <div className="pfizer-mark">
      <img alt="Pfizer" src={pfizerLogo} />
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  fullWidth = false,
}: {
  children: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <button
      className={`action-button action-button--${variant}${fullWidth ? ' action-button--full' : ''}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function ScreenFrame({
  title,
  eyebrow,
  children,
  footer,
  tone = 'light',
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
  footer?: ReactNode;
  tone?: 'light' | 'dark';
}) {
  return (
    <section className={`screen screen--${tone}`}>
      <div className="screen__backdrop" />
      <header className="screen__header">
        <p className="screen__eyebrow">{eyebrow}</p>
        <h1 className="screen__title">{title}</h1>
      </header>
      <div className="screen__body">{children}</div>
      {footer ? <div className="screen__footer">{footer}</div> : null}
      {/*
      <div className="screen__brand">
        <BrandMark tone={tone === 'dark' ? 'dark' : 'light'} />
      </div>
      */}
    </section>
  );
}

function CameraStage({
  videoRef,
  ready,
  loading,
  overlay,
}: {
  videoRef: (node: HTMLVideoElement | null) => void;
  ready: boolean;
  loading: boolean;
  overlay?: ReactNode;
}) {
  return (
    <div className="stage stage--camera">
      <video className="stage__video" muted playsInline ref={videoRef} />
      <div className="stage__scrim" />
      <div aria-hidden="true" className="stage__guide">
        <div className="stage__diamond" />
        <div className="stage__ring" />
      </div>
      {!ready ? (
        <div className="stage__status" role="status">
          <div className="stage__spinner" />
          <p>{loading ? 'Iniciando cámara...' : 'Esperando vista previa...'}</p>
        </div>
      ) : null}
      {overlay}
    </div>
  );
}

function FlowBadge({ state }: { state: FlowState }) {
  const labels: Record<FlowState, string> = {
    home: 'Inicio',
    consent: 'Consentimiento',
    camera: 'Cámara',
    countdown: 'Cuenta regresiva',
    review: 'Validación',
    printing: 'Impresión',
    cameraError: 'Error',
  };

  return <span className="flow-badge">{labels[state]}</span>;
}

export default function App() {
  const [snapshot, send] = useMachine(kioskMachine);
  const [activityTick, setActivityTick] = useState(0);
  const captureRef = useRef<() => Promise<Awaited<ReturnType<typeof capturePhoto>>> | null>(null);
  const errorHandlerRef = useRef<((error: CameraErrorDetails) => void) | null>(null);

  const flowState = getFlowState(snapshot);
  const captureRequested = snapshot.matches({ countdown: 'capturing' });
  const cameraActive = flowState === 'camera' || flowState === 'countdown';

  const { capture, isReady, isStarting, videoRef } = useCameraController(
    cameraActive,
    (error) => {
      startTransition(() => {
        send({
          type: 'CAMERA_FAILURE',
          error,
        });
      });
    },
  );

  useEffect(() => {
    captureRef.current = capture;
    errorHandlerRef.current = (error) => {
      startTransition(() => {
        send({
          type: 'CAMERA_FAILURE',
          error,
        });
      });
    };
  }, [capture, send]);

  useEffect(() => {
    const handlePointerDown = () => {
      if (!resetsOnIdle(flowState)) {
        return;
      }

      startTransition(() => {
        setActivityTick((value) => value + 1);
      });
    };

    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [flowState]);

  useEffect(() => {
    if (!resetsOnIdle(flowState)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      send({ type: 'IDLE_TIMEOUT' });
    }, kioskConfig.idleMs);

    return () => window.clearTimeout(timeoutId);
  }, [activityTick, flowState, send]);

  useEffect(() => {
    if (!captureRequested) {
      return;
    }

    let cancelled = false;

    async function runCapture() {
      try {
        const photo = await captureRef.current?.();

        if (!cancelled && photo) {
          send({ type: 'PHOTO_CAPTURED', photo });
        }
      } catch (error) {
        if (!cancelled) {
          errorHandlerRef.current?.(normalizeCameraError(error));
        }
      }
    }

    void runCapture();

    return () => {
      cancelled = true;
    };
  }, [captureRequested, send]);

  const session = snapshot.context;
  const showPfizerLogo = flowState !== 'camera' && flowState !== 'review';

  return (
    <div className="app-shell">
      <main className="kiosk">
        <div className="kiosk__chrome">
          <FlowBadge state={flowState} />
          <div className="kiosk__brand">
            <BrandMark />
          </div>
        </div>

        {showPfizerLogo ? (
          <div className="kiosk__footer-brand">
            <PfizerMark />
          </div>
        ) : null}

        {flowState === 'home' ? (
          <section className="hero-screen">
            <div className="hero-screen__mesh" />
            <div className="hero-screen__panel">
              <div className="hero-screen__copy">
                <p className="hero-screen__eyebrow">EMBLAVEO EXPERIENCE</p>
                <h1>
                  Sumate con tu foto y sé parte de una nueva era en el tratamiento de las
                  infecciones multirresistentes
                </h1>
                <p className="hero-screen__lead">
                  Acercate al visor, acomodate y completá el recorrido en menos de un
                  minuto.
                </p>
                <div className="hero-screen__cta">
                  <ActionButton fullWidth onClick={() => send({ type: 'BEGIN' })}>
                    Participar
                  </ActionButton>
                </div>
              </div>
            </div>

            {/*
            <div className="hero-screen__badge">
              <BrandMark tone="dark" />
            </div>
            */}
          </section>
        ) : null}

        {flowState === 'consent' ? (
          <ScreenFrame
            eyebrow="Paso 1"
            title="Antes de empezar, necesitamos tu consentimiento"
          >
            <div className="card">
              <p className="card__lead">
                Al continuar aceptás que tu imagen sea capturada y mostrada en un mural
                visual de la activación EMBLAVEO.
              </p>
              <label className="consent-toggle">
                <input
                  checked={session.consentAccepted}
                  onChange={(event) =>
                    send({
                      type: 'ACCEPT_CONSENT',
                      accepted: event.currentTarget.checked,
                    })
                  }
                  type="checkbox"
                />
                <span>
                  Acepto participar y autorizo el uso de esta foto dentro del mural de la
                  experiencia.
                </span>
              </label>
              <div className="button-row consent-actions">
                <ActionButton onClick={() => send({ type: 'BACK' })} variant="secondary">
                  Volver
                </ActionButton>
                <ActionButton
                  disabled={!session.consentAccepted}
                  onClick={() => send({ type: 'CONTINUE' })}
                >
                  Continuar
                </ActionButton>
              </div>
            </div>
          </ScreenFrame>
        ) : null}

        {flowState === 'camera' ? (
          <ScreenFrame
            eyebrow="Paso 2"
            footer={
              <div className="button-row button-row--camera">
                <ActionButton onClick={() => send({ type: 'BACK' })} variant="secondary">
                  Volver
                </ActionButton>
                <ActionButton disabled={!isReady} onClick={() => send({ type: 'START_COUNTDOWN' })}>
                  Tomar foto
                </ActionButton>
              </div>
            }
            title="Buscá tu mejor encuadre"
          >
            <div className="screen-stack">
              <CameraStage loading={isStarting} ready={isReady} videoRef={videoRef} />
              <div className="info-strip">
                <p>Tomate 5 segundos para acomodarte y sonreí.</p>
                <span>Usá la guía para centrar tu rostro y hombros.</span>
              </div>
            </div>
          </ScreenFrame>
        ) : null}

        {flowState === 'countdown' ? (
          <ScreenFrame eyebrow="Paso 3" title="Perfecto, mantené la pose" tone="dark">
            <div className="screen-stack screen-stack--tight">
              <CameraStage
                loading={isStarting}
                overlay={
                  <div className="countdown-overlay">
                    <p className="countdown-overlay__label">
                      {captureRequested ? '¡Sonreí!' : 'Foto en'}
                    </p>
                    <strong className="countdown-overlay__value">
                      {captureRequested ? 'YA' : session.countdownValue}
                    </strong>
                  </div>
                }
                ready={isReady}
                videoRef={videoRef}
              />
            </div>
          </ScreenFrame>
        ) : null}

        {flowState === 'review' ? (
          <ScreenFrame
            eyebrow="Paso 4"
            footer={
              <div className="button-row">
                <ActionButton onClick={() => send({ type: 'RETAKE' })} variant="secondary">
                  Repetir
                </ActionButton>
                <ActionButton onClick={() => send({ type: 'CONFIRM_PRINT' })}>
                  Confirmar
                </ActionButton>
              </div>
            }
            title="Revisá tu foto"
          >
            <div className="screen-stack">
              <div className="stage stage--review">
                {session.capturedUrl ? (
                  <img alt="Foto capturada" className="stage__photo" src={session.capturedUrl} />
                ) : null}
              </div>
            </div>
          </ScreenFrame>
        ) : null}

        {flowState === 'printing' ? (
          <ScreenFrame eyebrow="Paso 5" title="Tu foto se está imprimiendo" tone="dark">
            <div className="printing-screen">
              <div className="printing-screen__paper">
                <div className="printing-screen__sheet">
                  {session.capturedUrl ? (
                    <img alt="Vista previa de impresión" src={session.capturedUrl} />
                  ) : null}
                </div>
                <div className="printing-screen__pulse" />
              </div>
              <p className="printing-screen__lead">
                En unos segundos volvemos al inicio para la próxima persona.
              </p>
            </div>
          </ScreenFrame>
        ) : null}

        {flowState === 'cameraError' ? (
          <ScreenFrame
            eyebrow="Cámara"
            footer={
              <div className="button-row">
                <ActionButton onClick={() => send({ type: 'HOME' })} variant="secondary">
                  Ir al inicio
                </ActionButton>
                <ActionButton onClick={() => send({ type: 'RETRY' })}>Reintentar</ActionButton>
              </div>
            }
            title="Necesitamos volver a intentar"
          >
            <div className="card card--error">
              <p className="card__lead">{session.cameraError?.message}</p>
              <span>
                Si el problema persiste, revisá la webcam del tótem o reiniciá el modo
                kiosco.
              </span>
            </div>
          </ScreenFrame>
        ) : null}
      </main>
    </div>
  );
}
