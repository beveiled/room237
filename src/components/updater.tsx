"use client";

import { cn } from "@/lib/utils";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { motion } from "framer-motion";
import { CloudDownload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export function InstallerToast({ update }: { update: Update }) {
  const [isInstalling, setIsInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const totalLength = useRef<number>(0);
  const totalDownloaded = useRef<number>(0);

  useEffect(() => {
    setTimeout(() => {
      setIsInstalling(!isInstalling);
    }, 5000);
  }, [isInstalling]);

  return (
    <div className="relative w-80.5">
      <div className="flex w-full flex-col gap-2">
        <p>
          {!isInstalling
            ? `Update available: ${update.version}`
            : "Installing update..."}
        </p>
        <div className="relative h-fit w-fit">
          <motion.button
            onClick={async () => {
              setIsInstalling(true);
              try {
                await update.downloadAndInstall((p) => {
                  if (p.event === "Started") {
                    totalLength.current = p.data.contentLength!;
                    setProgress(0);
                  }
                  if (p.event === "Progress") {
                    totalDownloaded.current += p.data.chunkLength;
                    setProgress(
                      (totalDownloaded.current / totalLength.current) * 100,
                    );
                  }
                });
                await relaunch();
              } catch {
                toast.error("Failed to install update");
              } finally {
                setIsInstalling(false);
              }
              toast.dismiss();
            }}
            className={cn(
              "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-8 w-fit shrink-0 cursor-pointer items-center justify-center gap-1.5 overflow-hidden rounded-3xl px-3 text-xs font-medium whitespace-nowrap shadow-xs transition-colors duration-100 outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 has-[>svg]:px-2.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
              isInstalling && "bg-secondary text-transparent",
            )}
            initial={{}}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 600, damping: 35 }}
            animate={isInstalling ? { width: 312, height: 4 } : {}}
          >
            <CloudDownload />
            Install Update
          </motion.button>
          {isInstalling && (
            <div
              className="bg-secondary-foreground absolute top-1 left-0 h-1 rounded-3xl"
              style={{ width: `${progress}%` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function Updater() {
  const toastId = useRef<string | number | null>(null);

  const checkForUpdates = useCallback(async () => {
    if (toastId.current) return;
    const update = await check();
    if (update) {
      toastId.current = toast(<InstallerToast update={update} />, {
        duration: Infinity,
      });
    }
  }, []);

  useEffect(() => {
    void checkForUpdates();
    const interval = setInterval(
      () => {
        void checkForUpdates();
      },
      15 * 60 * 1000,
    );

    return () => {
      clearInterval(interval);
      if (toastId.current) {
        toast.dismiss(toastId.current);
        toastId.current = null;
      }
    };
  }, [checkForUpdates]);

  return null;
}
