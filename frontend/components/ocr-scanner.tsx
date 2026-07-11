'use client';

import { useEffect, useRef, useState } from 'react';
import { createWorker } from 'tesseract.js';

// El VIN es de 17 caracteres y NUNCA usa las letras I, O ni Q (para no
// confundirlas con 1 y 0). Con esa lista blanca el OCR se equivoca mucho menos.
const VIN_CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
const MIN_LEN = 8;

// El motor (worker + core WASM) y el idioma se sirven desde el propio servidor
// (public/tesseract). Así el OCR funciona sin depender de un CDN de internet,
// que es lo que fallaba en la red del puerto y dejaba el OCR sin leer nada.
const TESS = {
  workerPath: '/tesseract/worker.min.js',
  corePath: '/tesseract/core',
  langPath: '/tesseract/lang',
  gzip: false, // eng.traineddata se guarda sin comprimir
};

function bestCandidate(text: string): string {
  return (
    (text || '')
      .toUpperCase()
      .split(/\s+/)
      .map((s) => s.replace(/[^A-Z0-9]/g, ''))
      .filter((s) => s.length >= MIN_LEN)
      .sort((a, b) => b.length - a.length)[0] || ''
  );
}

type Phase = 'cam' | 'engine' | 'scan';

/**
 * OCR en vivo del VIN / serie del chasis con la cámara trasera.
 * Analiza el recuadro central cada ~1.2 s. Muestra siempre la última lectura y
 * un botón para usarla; además, si dos ciclos seguidos coinciden (o aparece un
 * VIN completo de 17), la acepta sola.
 *
 * Una sola cámara: un único <video> propio y un único stream que se corta en la
 * limpieza. En dev React (StrictMode) el efecto corre dos veces; el segundo
 * arranque detiene primero cualquier stream anterior, así nunca hay "dos cámaras".
 */
export default function OcrScanner({
  onResult,
  onClose,
}: {
  onResult: (text: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [err, setErr] = useState('');
  const [phase, setPhase] = useState<Phase>('cam');
  const [progress, setProgress] = useState(0);
  const [seen, setSeen] = useState('');

  // El padre suele pasar una lambda nueva en cada render; guardarla en una ref
  // evita que el efecto reinicie la cámara.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastHit = '';

    // Recorta el recuadro central, lo amplía y lo pasa a gris con contraste:
    // tesseract lee mucho mejor texto grande y con buen contraste.
    function grabFrame(): HTMLCanvasElement | null {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !video.videoWidth) return null;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const cw = Math.round(vw * 0.86);
      const ch = Math.round(vh * 0.3);
      const scale = 1.8; // ampliar ayuda a leer series pequeñas
      canvas.width = Math.round(cw * scale);
      canvas.height = Math.round(ch * scale);
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(video, Math.round((vw - cw) / 2), Math.round((vh - ch) / 2), cw, ch, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        // luminancia y realce de contraste alrededor del gris medio
        let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        g = (g - 128) * 1.4 + 128;
        g = g < 0 ? 0 : g > 255 ? 255 : g;
        d[i] = d[i + 1] = d[i + 2] = g;
      }
      ctx.putImageData(img, 0, 0);
      return canvas;
    }

    async function scanLoop() {
      if (cancelled || !worker) return;
      const canvas = grabFrame();
      if (canvas) {
        try {
          const { data } = await worker.recognize(canvas);
          if (cancelled) return;
          const hit = bestCandidate(data.text);
          if (hit) {
            setSeen(hit);
            if (hit.length === 17 || hit === lastHit) {
              onResultRef.current(hit);
              return;
            }
            lastHit = hit;
          }
        } catch {
          /* frame ilegible: sigue intentando */
        }
      }
      if (!cancelled) timer = setTimeout(scanLoop, 1200);
    }

    async function start() {
      // 1) Cámara
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
      } catch (e) {
        if (!cancelled) {
          const name = e instanceof Error ? e.name : '';
          setErr(
            name === 'NotAllowedError'
              ? 'Permiso de cámara denegado. Habilítalo en el navegador.'
              : name === 'NotReadableError'
                ? 'La cámara está en uso por otra app. Ciérrala e intenta de nuevo.'
                : 'No se pudo abrir la cámara. En el móvil requiere HTTPS.',
          );
        }
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
        /* autoplay puede rechazar; el frame igual se captura */
      }

      // 2) Motor OCR (desde /public/tesseract, sin internet)
      if (cancelled) return;
      setPhase('engine');
      try {
        worker = await createWorker('eng', 1, {
          ...TESS,
          logger: (m) => {
            if (!cancelled && typeof m.progress === 'number' && m.status.includes('traineddata')) {
              setProgress(Math.round(m.progress * 100));
            }
          },
        });
        await worker.setParameters({ tessedit_char_whitelist: VIN_CHARS });
      } catch {
        if (!cancelled) setErr('No se pudo cargar el motor OCR. Recarga la página o avisa a soporte.');
        return;
      }
      if (cancelled) return;
      setPhase('scan');
      scanLoop();
    }
    start();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (worker) worker.terminate().catch(() => {});
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
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {!err && (
        <div className="muted" style={{ marginTop: 8 }}>
          {phase === 'cam' ? (
            'Iniciando cámara…'
          ) : phase === 'engine' ? (
            <>Cargando motor OCR{progress ? ` ${progress}%` : '…'}</>
          ) : seen ? (
            <>
              Leyendo… <strong>{seen}</strong>
            </>
          ) : (
            'Encuadra la serie / VIN dentro del recuadro'
          )}
        </div>
      )}

      {seen && (
        <button className="btn" style={{ marginTop: 8 }} onClick={() => onResult(seen)}>
          Usar “{seen}”
        </button>
      )}
      <button className="btn secondary" onClick={onClose} style={{ marginTop: 8 }}>
        Cancelar
      </button>
    </div>
  );
}
