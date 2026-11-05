/* ============================================================
   ImageCropper.tsx — atur posisi & zoom gambar sebelum disimpan.

   Pop-up di atas modal pemanggilnya: judul, area gambar dengan
   bingkai crop (lingkaran untuk foto profil, kotak membulat untuk
   ikon), slider zoom dengan tombol −/+, dan dua tombol aksi.
   Hasilnya dirender ke canvas `outputSize` × `outputSize` dari
   area di dalam bingkai.
   ============================================================ */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal, ModalHead } from './Ui';
import { Icon } from './IconSprite';
import { t } from '../i18n';

const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
/** Bingkai crop = 76% dari lebar area gambar; sisanya jadi ruang gelap di sekelilingnya. */
const HOLE_RATIO = 0.76;

export function ImageCropper({
  file,
  outputSize,
  shape,
  title,
  confirmLabel,
  onConfirm,
  onCancel,
  onError
}: {
  file: File;
  outputSize: number;
  shape: 'circle' | 'rounded';
  title: string;
  confirmLabel: string;
  onConfirm: (canvas: HTMLCanvasElement) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [src, setSrc] = useState('');
  const [size, setSize] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  // Muat gambar dari file; callback efek yang sudah dibatalkan diabaikan
  // (React StrictMode menjalankan efek dua kali di mode dev).
  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(file);
    const element = new Image();
    element.onload = () => { if (!cancelled) { setImage(element); setSrc(url); } };
    element.onerror = () => { if (!cancelled) { onError(t('We could not read that image.')); onCancel(); } };
    element.src = url;
    return () => { cancelled = true; URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Ukur area gambar (lebarnya fluid, tingginya mengikuti aspect-ratio 1).
  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const measure = () => setSize(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const hole = size * HOLE_RATIO;
  const base = image && hole ? hole / Math.min(image.width, image.height) : 1;
  const scale = base * zoom;

  /** Gambar tidak boleh bergeser sampai bingkai crop ada bagian yang kosong. */
  function clamp(next: { x: number; y: number }, forScale: number) {
    if (!image) return next;
    const maxX = Math.max(0, (image.width * forScale - hole) / 2);
    const maxY = Math.max(0, (image.height * forScale - hole) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y))
    };
  }

  function changeZoom(value: number) {
    const next = Math.min(MAX_ZOOM, Math.max(1, value));
    setZoom(next);
    setOffset((current) => clamp(current, base * next));
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    setDragging(true);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    setOffset(clamp({
      x: drag.current.ox + event.clientX - drag.current.x,
      y: drag.current.oy + event.clientY - drag.current.y
    }, scale));
  }

  function onPointerUp() {
    drag.current = null;
    setDragging(false);
  }

  function confirm() {
    if (!image || !hole) return;
    const view = hole / scale; // sisi area di dalam bingkai, dalam piksel gambar asli
    const sx = (image.width * scale / 2 - hole / 2 - current.x) / scale;
    const sy = (image.height * scale / 2 - hole / 2 - current.y) / scale;
    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext('2d');
    if (!context) { onError(t('We could not process that image.')); return; }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, sx, sy, view, view, 0, 0, outputSize, outputSize);
    onConfirm(canvas);
  }

  const current = clamp(offset, scale);

  return createPortal(
    <Modal
      className="cropper-modal"
      onClose={onCancel}
      head={
        <ModalHead
          title={title}
          desc={t('Drag to move, use the slider to zoom.')}
          closeLabel={t('Close')}
          onClose={onCancel}
        />
      }
      foot={
        <div className="modal-foot">
          <button className="btn secondary" type="button" onClick={onCancel}>{t('Cancel')}</button>
          <button className="btn primary" type="button" onClick={confirm} disabled={!image}>{confirmLabel}</button>
        </div>
      }
    >
      <div className="cropper">
        <div
          ref={stage}
          className={`cropper-stage ${shape}${dragging ? ' dragging' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {image && size > 0 && (
            <img
              src={src}
              alt=""
              draggable={false}
              style={{
                width: image.width * scale,
                height: image.height * scale,
                left: size / 2 + current.x - (image.width * scale) / 2,
                top: size / 2 + current.y - (image.height * scale) / 2
              }}
            />
          )}
          <div className="cropper-hole" aria-hidden="true" />
        </div>
        <div className="cropper-zoom">
          <button
            className="cropper-step"
            type="button"
            aria-label={t('Zoom out')}
            disabled={zoom <= 1}
            onClick={() => changeZoom(zoom - ZOOM_STEP)}
          >
            <Icon name="minus" />
          </button>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            aria-label={t('Zoom')}
            onChange={(event) => changeZoom(Number(event.target.value))}
          />
          <button
            className="cropper-step"
            type="button"
            aria-label={t('Zoom in')}
            disabled={zoom >= MAX_ZOOM}
            onClick={() => changeZoom(zoom + ZOOM_STEP)}
          >
            <Icon name="plus" />
          </button>
        </div>
      </div>
    </Modal>,
    document.body
  );
}
