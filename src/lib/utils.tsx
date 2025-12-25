import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { FileMeta, MediaEntry, OS } from "./types";
import { convertFileSrc } from "@tauri-apps/api/core";
import path from "path";
import { type DetachedMediaEntry } from "./types";
import { exists, readFile } from "@tauri-apps/plugin-fs";
import { TbBrandFinder } from "react-icons/tb";
import type { JSX } from "react";
import { Folder } from "lucide-react";
import type { FileManager } from "./fs/albumService";
import { GiDolphin } from "react-icons/gi";
import { SiGnome, SiPantheon } from "react-icons/si";

import { useEffect, useState } from "react";
import { toast } from "@/components/toaster";

export const cn = (...i: ClassValue[]) => twMerge(clsx(i));

export const isImage = (n: string) =>
  /\.(png|jpe?g|gif|bmp|webp|avif)$/i.test(n);
export const isVideo = (n: string) => /\.(mp4|webm|ogg)$/i.test(n);
export const isMedia = (n: string) => isImage(n) || isVideo(n);
export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function splitName(name: string): {
  stem: string;
  ext: string;
  startCounter: number;
} {
  const ext = path.extname(name);
  const stemRaw = path.basename(name, ext);
  const match = /^(.*)_([0-9]+)$/.exec(stemRaw);
  if (match?.[1]) {
    return { stem: match[1], ext, startCounter: parseInt(match[2]!, 10) };
  }
  return { stem: stemRaw, ext, startCounter: 0 };
}

export async function nextAvailableName(
  dir: string,
  stem: string,
  ext: string,
  startCounter = 0,
): Promise<string> {
  let counter = startCounter;
  let candidate = counter > 0 ? `${stem}_${counter}${ext}` : `${stem}${ext}`;
  while (await exists(path.join(dir, candidate))) {
    counter += 1;
    candidate = `${stem}_${counter}${ext}`;
  }
  return candidate;
}

export const loadImageDims = (f: File) =>
  new Promise<{ w: number; h: number }>((res, rej) => {
    const i = new Image();
    i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
    i.onerror = rej;
    i.src = URL.createObjectURL(f);
  });

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
  albumName: string,
  albumId: string,
): MediaEntry {
  return {
    url: convertFileSrc(path.join(albumPath, entry.name)),
    thumb: convertFileSrc(
      path.join(albumPath, ".room237-thumb", `${entry.name}.webp`),
    ),
    meta: unpackFileMeta(entry.meta),
    name: entry.name,
    path: path.join(albumPath, entry.name),
    favorite: entry.favorite ?? false,
    albumId,
    albumPath,
    albumName,
  } satisfies MediaEntry;
}

export const copyFile = async (item: MediaEntry): Promise<Blob> => {
  if (!item) throw new Error("No item selected");
  if (item.name.toLowerCase().endsWith(".png")) {
    const file = await readFile(item.path);
    if (!file) {
      toast.error("Failed to read image file.");
      throw new Error("Failed to read image file.");
    }
    const blob = new Blob([file.buffer], {
      type: "image/png",
    });
    // BUG: Async Clipboard API on Webkit (Safari) raises NotAllowed if the blob is passed instead of a Promise
    // ? Thus, it is more logical to send a toast here (when the file is actually loaded), since
    // ? it is the closest we can get to the actual state of success.
    toast.success("Image copied to clipboard!");
    return blob;
  }
  if (!isImage(item.name)) {
    throw new Error("Failed to read image file.");
  }

  const file = await readFile(item.path);
  if (!file) {
    toast.error("Failed to read image file.");
    throw new Error("Failed to read image file.");
  }

  const blob = new Blob([file.buffer]);
  const imageBitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to read image file.");
  }
  ctx.drawImage(imageBitmap, 0, 0);
  const pngBlob = await canvas.convertToBlob({ type: "image/png" });
  toast.success("Image copied to clipboard!");
  return pngBlob;
};

type IdleDeadlineLike = { timeRemaining(): number };
type IdleCb = (deadline: IdleDeadlineLike) => void;

export const requestIdle = (cb: IdleCb): number => {
  const w = window as typeof window & {
    requestIdleCallback?: (cb: IdleCb) => number;
  };
  if (w.requestIdleCallback) return w.requestIdleCallback(cb);
  return window.setTimeout(() => cb({ timeRemaining: () => 0 }), 1);
};

export const cancelIdle = (id: number): void => {
  const w = window as typeof window & {
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.cancelIdleCallback) w.cancelIdleCallback(id);
  else window.clearTimeout(id);
};

export const getFileManagerIcon = (name: FileManager): JSX.Element => {
  switch (name) {
    case "Finder":
      return <TbBrandFinder className="h-4 w-4" />;
    case "Dolphin":
      return <GiDolphin className="h-4 w-4" />;
    case "GNOME Files":
      return <SiGnome className="h-4 w-4" />;
    case "Pantheon Files":
      return <SiPantheon className="h-4 w-4" />;
    default:
      return <Folder className="h-4 w-4" />;
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const debounce = <F extends (...args: any[]) => void>(
  func: F,
): ((...args: Parameters<F>) => void) & { cancel: () => void } => {
  let rafId: number | null = null;
  let lastArgs: Parameters<F> | null = null;

  const cancel = () => {
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = null;
    lastArgs = null;
  };

  const debounced = ((...args: Parameters<F>) => {
    lastArgs = args;
    if (rafId != null) return;

    rafId = requestAnimationFrame(() => {
      rafId = null;
      const a = lastArgs;
      lastArgs = null;
      if (a) func(...a);
    });
  }) as ((...args: Parameters<F>) => void) & { cancel: () => void };

  debounced.cancel = cancel;

  return debounced;
};

export const useOS = (): OS => {
  const [os, setOS] = useState<OS>("other");

  useEffect(() => {
    const { userAgent } = window.navigator;

    if (userAgent.includes("Mac")) {
      setOS("macos");
    } else {
      setOS("other");
    }
  }, []);

  return os;
};
