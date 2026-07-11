'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

// Formatos habituales en VIN y etiquetas logísticas.
const FORMATS = [
  'code_39',
  'code_128',
  'code_93',
  'codabar',
  'ean_13',
  'ean_8',
  'itf',
  'upc_a',
  'upc_e',
  'qr_code',
  'data_matrix',
  'pdf417',
];

function camMessage(e: unknown): string {
  const name = e instanceof Error ? e.name : '';
  if (name === 'NotAllowedError') return 'Permiso de cámara denegado. Habilítalo en el navegador.';
  if (name === 'NotReadableError') return 'La cámara está en uso por otra app. Ciérrala e intenta de nuevo.';
  return 'No se pudo abrir la cámara. En el móvil requiere HTTPS.';
}

/**
 * Escáner de código de barras / QR.
 *
 * En navegadores con `BarcodeDetector` (celulares Android, el caso real de
 * campo) usa UNA sola cámara propia: un único <video> y un único stream que se
 * corta en la limpieza. Así nunca aparecen "dos cámaras", ni siquiera con el
 * doble montaje de StrictMode en dev. Si el navegador no lo soporta, cae al
 * lector html5-qrcode.
 */
export default function BarcodeScanner(props: {
  onDetected: (text: string) => void;
  onClose: () => void;
}) {
  // Se decide en el cliente para no romper la hidratación (window no existe en SSR).
  const [mode, setMode] = useState<'native' | 'fallback' | null>(null);
  useEffect(() => {
    setMode('BarcodeDetector' in window ? 'native' : 'fallback');
  }, []);

  if (mode === null) {
    return (
      <div className="scan-box">
        <div className="muted">Iniciando cámara…</div>
        <button className="btn secondary" onClick={props.onClose} style={{ marginTop: 8 }}>
          Cancelar
        </button>
      </div>
    );
  }
  return mode === 'native' ? <NativeScanner {...props} /> : <FallbackScanner {...props} />;
}

/** Cámara única con la API nativa BarcodeDetector. */
function NativeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (text: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detector = new (window as any).BarcodeDetector({ formats: FORMATS });

    async function loop() {
      if (cancelled || !videoRef.current || !videoRef.current.videoWidth) {
        if (!cancelled) timer = setTimeout(loop, 250);
        return;
      }
      try {
        const codes = await detector.detect(videoRef.current);
        if (cancelled) return;
        const val: string = codes?.[0]?.rawValue?.trim() || '';
        if (val) {
          cancelled = true;
          onDetectedRef.current(val);
          return;
        }
      } catch {
        /* frame sin lectura: sigue */
      }
      if (!cancelled) timer = setTimeout(loop, 250);
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
      } catch (e) {
        if (!cancelled) setErr(camMessage(e));
        return;
      }
      if (cancelled || !videoRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      // Corta cualquier stream previo pegado al <video> (StrictMode) antes de reusarlo.
      const prev = videoRef.current.srcObject as MediaStream | null;
      if (prev) prev.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = stream;
      try {
        await videoRef.current.play();
      } catch {
        /* autoplay puede rechazar; igual detectamos sobre el frame */
      }
      if (cancelled) return;
      loop();
    }
    start();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="scan-box">
      {err ? (
        <div className="error">{err}</div>
      ) : (
        <div className="cam-wrap">
          <video ref={videoRef} playsInline muted className="cam-video" />
          <div className="cam-guide" />
        </div>
      )}
      {!err && (
        <div className="muted" style={{ marginTop: 8 }}>
          Apunta al código de barras / QR
        </div>
      )}
      <button className="btn secondary" onClick={onClose} style={{ marginTop: 8 }}>
        Cancelar
      </button>
    </div>
  );
}

/** Respaldo para navegadores sin BarcodeDetector (html5-qrcode). */
function FallbackScanner({
  onDetected,
  onClose,
}: {
  onDetected: (text: string) => void;
  onClose: () => void;
}) {
  const [err, setErr] = useState('');
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    let cancelled = false;
    let scanner: Html5Qrcode | null = null;

    // Arrancar en el PRÓXIMO tick es la clave contra la "cámara doble": en dev
    // React (StrictMode) el efecto se monta, se limpia y se vuelve a montar en el
    // mismo tick. Con el arranque diferido, la limpieza del primer montaje cancela
    // su temporizador ANTES de crear la cámara, así solo queda una instancia viva.
    const timer = setTimeout(async () => {
      if (cancelled) return;
      const el = document.getElementById('barcode-reader');
      if (el) el.replaceChildren();
      scanner = new Html5Qrcode('barcode-reader');
      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 130 } },
          (decodedText) => {
            if (cancelled) return;
            cancelled = true;
            scanner
              ?.stop()
              .catch(() => {})
              .finally(() => onDetectedRef.current(decodedText));
          },
          () => {
            /* ignora frames sin lectura */
          },
        );
        if (cancelled) await scanner.stop().catch(() => {});
      } catch (e) {
        if (!cancelled) setErr('No se pudo abrir la cámara: ' + e);
      }
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (scanner) {
        scanner
          .stop()
          .then(() => scanner?.clear())
          .catch(() => {});
      }
    };
  }, []);

  return (
    <div className="scan-box">
      {err && <div className="error">{err}</div>}
      <div id="barcode-reader" style={{ width: '100%' }} />
      <button className="btn secondary" onClick={onClose} style={{ marginTop: 8 }}>
        Cancelar
      </button>
    </div>
  );
}
