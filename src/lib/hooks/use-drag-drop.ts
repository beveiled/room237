"use client";

import type { MediaEntry } from "@/lib/types";
import { createStackPreview, animateFly } from "../utils";
import { useRoom237 } from "../stores";
import { useCallback } from "react";

export const INTERNAL_DRAG_MIME = "application/x-room237";

export function useDragDrop() {
  const setDraggedItems = useRoom237((state) => state.setDraggedItems);
  const clearDraggedItems = useRoom237((state) => state.clearDraggedItems);

  const onDragStart = useCallback(
    (
      e: MouseEvent | TouchEvent | PointerEvent | React.DragEvent<Element>,
      media: MediaEntry,
    ) => {
      const selection = useRoom237.getState().selection;
      const isSelected = selection.some((item) => item.path === media.path);
      if (!isSelected && selection.length > 0) {
        e.preventDefault();
        return;
      }
      const medias = isSelected ? Array.from(selection) : [media];
      setDraggedItems(medias);
      const sp = createStackPreview(medias);
      sp.style.position = "absolute";
      sp.style.top = "-9999px";
      sp.style.left = "-9999px";
      document.body.appendChild(sp);
      const r = sp.getBoundingClientRect();
      if (!("dataTransfer" in e)) return;
      try {
        e.dataTransfer.setData(INTERNAL_DRAG_MIME, "internal");
      } catch {}
      e.dataTransfer.setDragImage(sp, r.width / 2, r.height / 2);
      requestAnimationFrame(() => sp.remove());
      const rects = medias.map((i) =>
        document
          .querySelector(`[data-img-url="${CSS.escape(i.name)}"]`)
          ?.getBoundingClientRect(),
      );
      animateFly(medias, rects, e.clientX, e.clientY);
    },
    [setDraggedItems],
  );

  const getDragged = useCallback(() => useRoom237.getState().draggedItems, []);
  const clear = useCallback(() => clearDraggedItems(), [clearDraggedItems]);

  return { onDragStart, getDragged, clear, INTERNAL_DRAG_MIME };
}
