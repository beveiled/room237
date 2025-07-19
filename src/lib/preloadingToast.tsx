import { Player } from "@lottiefiles/react-lottie-player";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
        const progress = 0;

        if (isPreloading) {
          preloadingToastId = toast(
            <div className="relative w-full pb-4">
              <div className="flex w-full items-center gap-2">
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
              </div>
              <div className="bg-secondary absolute right-0 bottom-0 left-0 h-1 rounded-md">
                <div
                  className="bg-secondary-foreground h-full rounded-md transition-all duration-100 ease-in-out"
                  style={{ width: `${progress}%` }}
                  id="preload-progress-bar"
                ></div>
              </div>
            </div>,
            { duration: Infinity },
          );

          const unlisten = await listen("preload-progress", (event) => {
            const { progress } = event.payload as { progress: number };
            const progressBar = document.getElementById("preload-progress-bar");
            if (progressBar) {
              progressBar.style.width = `${progress}%`;
            }
          });

          try {
            await invoke("lock_until_preloaded");
          } finally {
            unlisten();
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
