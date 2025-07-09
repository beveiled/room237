/* eslint-disable @next/next/no-img-element */
"use client";

import { useGallery } from "@/lib/context/gallery-context";
import { isVideo } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export default function MediaViewer() {
  const { viewer, media } = useGallery();
  const [isClosing, setIsClosing] = useState(false);

  const close = useCallback(() => {
    setIsClosing(false);
    viewer.close();
  }, [viewer]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && setIsClosing(true);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const item = useMemo(
    () => (viewer.viewerIndex != null ? media[viewer.viewerIndex] : null),
    [viewer.viewerIndex, media],
  );

  const rect = useMemo(() => {
    if (!item) return undefined;
    const el = document.querySelector<HTMLImageElement>(
      `[data-img-url="${item.name}"]`,
    );
    if (!el) return undefined;
    const { x, y, width, height } = el.getBoundingClientRect();
    return {
      x: x - window.innerWidth / 2 + width / 2,
      y: y - window.innerHeight / 2 + width / 2,
      width,
      height,
      scale: 0.7,
    };
  }, [item]);

  if (!item || typeof window === "undefined") return null;

  const init = !isClosing
    ? (rect ?? { scale: 0.9, opacity: 0 })
    : { x: 0, y: 0, width: "auto", height: "auto", scale: 1, opacity: 1 };
  const anim = !isClosing
    ? { x: 0, y: 0, width: "auto", height: "auto", scale: 1, opacity: 1 }
    : (rect ?? { scale: 0.9, opacity: 0 });

  const content = (
    <AnimatePresence>
      <motion.div
        key="overlay"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: isClosing ? 0 : 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setIsClosing(true)}
      >
        <motion.div
          initial={init}
          animate={anim}
          onAnimationComplete={() => isClosing && close()}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", stiffness: 600, damping: 40 }}
          className="relative flex max-h-[90vh] max-w-[90vw]"
          onClick={(e) => e.stopPropagation()}
        >
          {isVideo(item.name) ? (
            <video
              src={item.url}
              controls
              autoPlay
              className="max-h-[90vh] max-w-[90vw] rounded-3xl"
            />
          ) : (
            <img
              src={item.url}
              className="max-h-[90vh] max-w-[90vw] rounded-3xl"
              alt="media"
            />
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
