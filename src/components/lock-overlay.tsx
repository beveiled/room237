"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Player } from "@lottiefiles/react-lottie-player";

export function LockOverlay({ locked }: { locked: boolean }) {
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
            <Player
              src="/lottie/lockscreen.json"
              background="transparent"
              className="size-26"
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
