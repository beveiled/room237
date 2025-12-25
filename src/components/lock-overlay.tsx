"use client";

import { LottiePlayer } from "@/lib/lottie";
import { useRoom237 } from "@/lib/stores";
import { AnimatePresence, motion } from "framer-motion";

export function LockOverlay() {
  const locked = useRoom237((state) => state.locked);

  return (
    <AnimatePresence>
      {locked && (
        <>
          <div
            className="absolute top-0 z-[9998] h-8 w-full"
            data-tauri-drag-region
          ></div>
          <motion.div
            key="lockscreen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.05 } }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            className="bg-background/80 fixed inset-0 z-[9997] flex flex-col items-center justify-center rounded-3xl pb-6 backdrop-blur-lg"
          >
            <LottiePlayer
              src="/lottie/lockscreen.json"
              background="transparent"
              className="size-26 invert"
              loop
              autoplay
            />
            <span className="my-2 text-xl font-semibold">
              FBI locked us out
            </span>
            <span className="text-secondary-foreground/50 max-w-xs text-center text-base">
              Unfortunately we cannot risk you seeing the media files in this
              gallery.
            </span>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
