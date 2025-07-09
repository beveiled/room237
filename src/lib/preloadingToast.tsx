import { Player } from "@lottiefiles/react-lottie-player";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

let preloadingToastId: string | number | null = null;

let debounceTimer: NodeJS.Timeout | null = null;

export const showPreloadingToast = (): Promise<void> => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  return new Promise<void>((resolveDebounce) => {
    debounceTimer = setTimeout(() => {
      (async () => {
        if (preloadingToastId) {
          resolveDebounce();
          return;
        }

        const isPreloading = await invoke<boolean>("is_preloading");

        if (isPreloading) {
          preloadingToastId = toast(
            <div className="flex items-center gap-2">
              <Player
                src="/lottie/preloading.json"
                autoplay
                loop
                className="size-8"
              />
              <div>
                <div data-title="">Uploading your data to FBI servers...</div>
                <div data-description="">
                  This might take a while, please wait
                </div>
              </div>
            </div>,
            {
              duration: Infinity,
            },
          );

          try {
            await invoke("lock_until_preloaded");
          } finally {
            toast.dismiss(preloadingToastId);
            preloadingToastId = null;
          }
        }

        resolveDebounce();
      })().catch((error) => {
        console.error("Error in preloading toast:", error);
        resolveDebounce();
      });
    }, 100);
  });
};
