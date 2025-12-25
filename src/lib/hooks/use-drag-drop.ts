"use client";

import type { MediaEntry } from "@/lib/types";
import { createStackPreview, animateFly } from "../utils";
import { useRoom237 } from "../stores";
import { isEqual } from "lodash";
import { useStoreWithEqualityFn } from "zustand/traditional";

export function useDragDrop() {
  const selection = useStoreWithEqualityFn(
    useRoom237,
    (state) => state.selection,
    isEqual,
  );
  const setDraggedItems = useRoom237((state) => state.setDraggedItems);
  const clearDraggedItems = useRoom237((state) => state.clearDraggedItems);

  const onDragStart = (
    e: MouseEvent | TouchEvent | PointerEvent | React.DragEvent<Element>,
    media: MediaEntry,
  ) => {
    if (!selection.includes(media) && selection.length > 0) {
      e.preventDefault();
      return;
    }
    const medias = selection.includes(media) ? Array.from(selection) : [media];
    setDraggedItems(medias);
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
  const getDragged = () => useRoom237.getState().draggedItems;
  const clear = () => clearDraggedItems();
  return { onDragStart, getDragged, clear };
}
