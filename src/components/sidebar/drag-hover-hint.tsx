"use client";

import { useRoom237 } from "@/lib/stores";
import { AnimatePresence, motion } from "framer-motion";
import { isEqual } from "lodash";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useStoreWithEqualityFn } from "zustand/traditional";

export function DragHoverHint() {
  const hint = useStoreWithEqualityFn(
    useRoom237,
    (state) => state.dragHoverHint,
    isEqual,
  );
  const clearDragHoverHint = useRoom237((state) => state.clearDragHoverHint);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!hint) {
      setPos(null);
      return;
    }

    let raf = 0;

    const updatePos = (x: number, y: number) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setPos({ x, y }));
    };

    const handleMouseMove = (e: MouseEvent) => {
      updatePos(e.clientX, e.clientY);
    };

    const handleDragOver = (e: DragEvent) => {
      updatePos(e.clientX, e.clientY);
    };

    const handleDragEnd = () => {
      clearDragHoverHint();
      setPos(null);
    };

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("dragend", handleDragEnd);
    window.addEventListener("drop", handleDragEnd);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("dragend", handleDragEnd);
      window.removeEventListener("drop", handleDragEnd);
    };
  }, [clearDragHoverHint, hint]);

  if (typeof window === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {hint && pos && (
        <motion.div
          key={hint.albumId}
          initial={{ opacity: 0, y: 6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98 }}
          transition={{ duration: 0.12 }}
          className="pointer-events-none fixed z-120 -mt-2 -translate-x-1/2 -translate-y-full"
          style={{ left: pos.x + 12, top: pos.y - 18 }}
        >
          <div className="rounded-full border border-white/15 bg-black/70 px-3 py-1 text-xs text-white shadow-xl backdrop-blur-md">
            {hint.text}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
