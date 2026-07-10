'use client';

import { useEffect, useRef, useState } from 'react';
import { createWorker } from 'tesseract.js';

// El VIN/chasis es la cadena alfanumérica larga de la imagen.
const MIN_LEN = 10;

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

/**
 * OCR en vivo del VIN / serie del chasis con la cámara trasera.
 * Analiza el recuadro central cada ~1.2 s y acepta la lectura cuando
 * dos ciclos seguidos coinciden (una sola lectura de OCR es poco fiable).
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
  const [ready, setReady] = useState(false);
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

    async function scanLoop() {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && worker && video.videoWidth) {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const cw = Math.round(vw * 0.86);
        const ch = Math.round(vh * 0.3);
        canvas.width = cw;
        canvas.height = ch;
        canvas
          .getContext('2d')!
          .drawImage(video, Math.round((vw - cw) / 2), Math.round((vh - ch) / 2), cw, ch, 0, 0, cw, ch);
        try {
          const { data } = await worker.recognize(canvas);
          if (cancelled) return;
          const hit = bestCandidate(data.text);
          if (hit) {
            setSeen(hit);
            if (hit === lastHit) {
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
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        videoRef.current!.srcObject = stream;
        await videoRef.current!.play();

        worker = await createWorker('eng');
        await worker.setParameters({
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        });
        if (cancelled) return;
        setReady(true);
        scanLoop();
      } catch (e) {
        if (!cancelled) {
          const name = e instanceof Error ? e.name : '';
          setErr(
            name === 'NotAllowedError'
              ? 'Permiso de cámara denegado.'
              : 'No se pudo abrir la cámara. En el móvil requiere HTTPS.',
          );
        }
      }
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
          {!ready ? (
            'Iniciando cámara…'
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
