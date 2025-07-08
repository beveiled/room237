"use client";

import { useRef } from "react";
import type { MediaEntry } from "@/lib/types";
import { createStackPreview, animateFly } from "../utils";

export function useDragDrop(selection: Set<MediaEntry>) {
  const dragRef = useRef<{ medias: MediaEntry[] } | null>(null);
  const onDragStart = (
    e: MouseEvent | TouchEvent | PointerEvent | React.DragEvent<Element>,
    media: MediaEntry,
  ) => {
    if (!selection.has(media) && selection.size > 0) {
      e.preventDefault();
      return;
    }
    const medias = selection.has(media) ? Array.from(selection) : [media];
    dragRef.current = { medias: medias };
    const sp = createStackPreview(medias);
    sp.style.position = "absolute";
    sp.style.top = "-9999px";
    sp.style.left = "-9999px";
    document.body.appendChild(sp);
    const r = sp.getBoundingClientRect();
    if (!("dataTransfer" in e)) return;
    e.dataTransfer.setDragImage(sp, r.width / 2, r.height / 2);
    requestAnimationFrame(() => sp.remove());
    const rects = medias.map((i) =>
      document
        .querySelector(`[data-img-url="${CSS.escape(i.name)}"]`)
        ?.getBoundingClientRect(),
    );
    animateFly(medias, rects, e.clientX, e.clientY);
  };
  const getDragged = () => dragRef.current?.medias ?? [];
  const clear = () => (dragRef.current = null);
  return { onDragStart, getDragged, clear };
}
