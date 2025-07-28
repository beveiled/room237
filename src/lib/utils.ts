import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { FileMeta, MediaEntry } from "./types";
import { convertFileSrc } from "@tauri-apps/api/core";
import path from "path";
import { type DetachedMediaEntry } from "./types";

export const cn = (...i: ClassValue[]) => twMerge(clsx(i));

export const isImage = (n: string) =>
  /\.(png|jpe?g|gif|bmp|webp|avif)$/i.test(n);
export const isVideo = (n: string) => /\.(mp4|webm|ogg)$/i.test(n);
export const isMedia = (n: string) => isImage(n) || isVideo(n);

export const loadImageDims = (f: File) =>
  new Promise<{ w: number; h: number }>((res, rej) => {
    const i = new Image();
    i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
    i.onerror = rej;
    i.src = URL.createObjectURL(f);
  });

export function masonry(medias: MediaEntry[], columns: number): MediaEntry[][] {
  const cols: { h: number; imgs: MediaEntry[] }[] = Array.from(
    { length: columns },
    () => ({ h: 0, imgs: [] }),
  );
  for (const media of medias) {
    const t = cols.reduce((a, b) => (a.h <= b.h ? a : b));
    const r = (media.meta.height ?? 1) / (media.meta.width ?? 1);
    t.imgs.push(media);
    t.h += r;
  }
  return cols.map((c) => c.imgs);
}

export function createStackPreview(medias: MediaEntry[]): HTMLDivElement {
  const c = document.createElement("div");
  c.style.position = "relative";
  c.style.width = "80px";
  c.style.height = "80px";
  c.style.userSelect = "none";
  c.style.pointerEvents = "none";
  c.style.borderRadius = "0.5rem";
  const cnt = Math.min(medias.length, 3);
  for (let i = 0; i < cnt; i += 1) {
    const el = document.createElement("img");
    el.src = medias[i]!.thumb;
    el.style.width = "80px";
    el.style.height = "80px";
    el.style.objectFit = "cover";
    el.style.position = "absolute";
    el.style.top = `${8 * i + 16}px`;
    el.style.left = `${8 * i + 16}px`;
    el.style.border = "1px solid rgba(0,0,0,0.25)";
    el.style.borderRadius = "0.5rem";
    el.draggable = false;
    c.appendChild(el);
  }
  if (medias.length > 3) {
    const o = document.createElement("div");
    o.textContent = String(medias.length);
    o.style.position = "absolute";
    o.style.marginLeft = "32px";
    o.style.marginTop = "32px";
    o.style.width = "80px";
    o.style.height = "80px";
    o.style.display = "flex";
    o.style.alignItems = "center";
    o.style.justifyContent = "center";
    o.style.backdropFilter = "blur(4px)";
    o.style.background = "rgba(0,0,0,0.4)";
    o.style.color = "white";
    o.style.fontWeight = "bold";
    o.style.fontSize = "20px";
    o.style.borderRadius = "0.5rem";
    c.appendChild(o);
  }
  return c;
}

export function animateFly(
  medias: MediaEntry[],
  rects: (DOMRect | undefined)[],
  startX: number,
  startY: number,
): void {
  const flyers: HTMLImageElement[] = [];

  medias.forEach((m, i) => {
    const r = rects[i];
    if (!r) return;

    const el = document.createElement("img");
    el.src = m.thumb;
    Object.assign(el.style, {
      position: "fixed",
      top: `${r.top}px`,
      left: `${r.left}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      objectFit: "cover",
      borderRadius: "1rem",
      zIndex: "9999",
      pointerEvents: "none",
      userSelect: "none",
      willChange: "transform",
    });
    document.body.appendChild(el);
    flyers.push(el);
  });

  const itemPositions = medias.map((m, i) => {
    const r = rects[i];
    if (!r) return { x: 0, y: 0 };
    return {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
    };
  });
  let curScale = 1;
  const ease = 0.15;
  let targetX = startX;
  let targetY = startY;

  let raf = requestAnimationFrame(function loop() {
    itemPositions.forEach((pos) => {
      pos.x += (targetX - pos.x) * ease;
      pos.y += (targetY - pos.y) * ease;
    });
    curScale -= (curScale - 0.2) * ease;

    flyers.forEach((el, i) => {
      const r = rects[i];
      if (!r) return;
      el.style.transform = `
        translate3d(
          ${itemPositions[i]!.x - r.left - r.width / 2}px,
          ${itemPositions[i]!.y - r.top - r.height / 2}px,
          0
        )
        scale(${curScale})
      `;
    });

    raf = requestAnimationFrame(loop);
  });

  const move = (e: PointerEvent | DragEvent) => {
    targetX = e.clientX;
    targetY = e.clientY;
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("dragover", move);

  requestAnimationFrame(() => {
    setTimeout(cleanup, 400);
  });

  function cleanup() {
    cancelAnimationFrame(raf);
    flyers.forEach((f) => f.remove());
    window.removeEventListener("pointermove", move);
    window.removeEventListener("dragover", move);
  }
}

export function unpackFileMeta(packed: string): FileMeta {
  const p = BigInt(packed);
  const added = Number(p & ((1n << 40n) - 1n));
  const shoot = Number((p >> 40n) & ((1n << 40n) - 1n));
  const width = Number((p >> 80n) & ((1n << 20n) - 1n));
  const height = Number((p >> 100n) & ((1n << 20n) - 1n));

  const isImage = (p & (1n << 120n)) !== 0n;
  const isVideo = (p & (1n << 121n)) !== 0n;
  const hasA = (p & (1n << 122n)) !== 0n;
  const hasS = (p & (1n << 123n)) !== 0n;
  const hasW = (p & (1n << 124n)) !== 0n;
  const hasH = (p & (1n << 125n)) !== 0n;

  return {
    added: hasA ? added : null,
    shoot: hasS ? shoot : null,
    isImage,
    isVideo,
    width: hasW ? width : undefined,
    height: hasH ? height : undefined,
  };
}

export function attachMediaEntry(
  albumPath: string,
  entry: DetachedMediaEntry,
): MediaEntry {
  return {
    url: convertFileSrc(path.join(albumPath, entry.name)),
    thumb: convertFileSrc(
      path.join(albumPath, ".room237-thumb", `${entry.name}.webp`),
    ),
    meta: unpackFileMeta(entry.meta),
    name: entry.name,
    path: path.join(albumPath, entry.name),
  } satisfies MediaEntry;
}
