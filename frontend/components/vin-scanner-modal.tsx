'use client';

import { useEffect, useRef, useState } from 'react';
import { IconAlert, IconClose } from '@/components/icons';

const DETECT_INTERVAL_MS = 200;

type ScanStatus = 'starting' | 'scanning' | 'denied' | 'unavailable';

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

/** BarcodeDetector no tiene tipos oficiales en lib.dom todavia. */
function createDetector(): BarcodeDetectorLike {
  const Ctor = (
    window as unknown as {
      BarcodeDetector: new (opts: { formats: string[] }) => BarcodeDetectorLike;
    }
  ).BarcodeDetector;
  return new Ctor({ formats: ['qr_code', 'code_128'] });
}

export function VinScannerModal({
  onDecode,
  onClose,
}: {
  onDecode: (raw: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<ScanStatus>('starting');

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    async function start() {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
      } catch (err) {
        if (!cancelled) {
          setStatus(
            err instanceof DOMException && err.name === 'NotAllowedError'
              ? 'denied'
              : 'unavailable',
          );
        }
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setStatus('scanning');

      const detector = createDetector();
      intervalId = setInterval(() => {
        detector
          .detect(video)
          .then((results) => {
            const hit = results.find((r) => r.rawValue.trim().length > 0);
            if (hit) {
              clearInterval(intervalId);
              onDecode(hit.rawValue.trim());
            }
          })
          .catch(() => {
            // Un frame ilegible no es un error: se reintenta en el proximo tick.
          });
      }, DETECT_INTERVAL_MS);
    }

    start();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [onDecode]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-modal="true">
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <p className="text-[13px] font-medium text-white/80">Escanear VIN</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="tap ring-focus grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white"
        >
          <IconClose className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex-1">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />

        {status === 'scanning' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-56 w-56 rounded-2xl border-2 border-white/70" />
          </div>
        )}

        {status === 'starting' && (
          <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[13px] text-white/70">
            Solicitando permiso de cámara…
          </p>
        )}

        {(status === 'denied' || status === 'unavailable') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <IconAlert className="h-8 w-8 text-white/70" />
            <p className="text-[13px] leading-relaxed text-white/80">
              {status === 'denied'
                ? 'No se pudo acceder a la cámara. Revisa los permisos del navegador.'
                : 'No se pudo iniciar la cámara en este dispositivo.'}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="tap ring-focus rounded-xl bg-white/10 px-5 py-2.5 text-[13px] font-medium text-white"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>

      <p className="safe-b px-4 py-4 text-center text-[12px] text-white/60">
        Apunta al código de barras o al QR del VIN
      </p>
    </div>
  );
}
