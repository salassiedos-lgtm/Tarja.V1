'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

/**
 * Escáner de código de barras / QR usando la cámara trasera.
 * onDetected(text) se llama al leer un código.
 */
export default function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (text: string) => void;
  onClose: () => void;
}) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const id = 'barcode-reader';
    const scanner = new Html5Qrcode(id);
    scannerRef.current = scanner;
    let stopped = false;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 130 } },
        (decodedText) => {
          if (stopped) return;
          stopped = true;
          scanner
            .stop()
            .then(() => onDetected(decodedText))
            .catch(() => onDetected(decodedText));
        },
        () => {
          /* ignora frames sin lectura */
        },
      )
      .catch((e) => setErr('No se pudo abrir la cámara: ' + e));

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [onDetected]);

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
