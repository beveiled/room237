import { watchImmediate } from "@tauri-apps/plugin-fs";
import { useEffect } from "react";
import { useRoom237 } from "../stores";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function useGalleryController() {
  const rootDir = useRoom237((state) => state.rootDir);
  const setAlbums = useRoom237((state) => state.setAlbums);
  const setActiveAlbumName = useRoom237((state) => state.setActiveAlbumName);
  const setLoadingAlbum = useRoom237((state) => state.setLoadingAlbum);
  const setAlbumsReady = useRoom237((state) => state.setAlbumsReady);
  const setIsUnfocused = useRoom237((state) => state.setIsUnfocused);

  useEffect(() => {
    setAlbumsReady(false);
    setAlbums({});
    setActiveAlbumName("");
    setLoadingAlbum(null);
  }, [rootDir, setAlbums, setActiveAlbumName, setLoadingAlbum, setAlbumsReady]);

  useEffect(() => {
    const window = getCurrentWindow();
    const unlistenBlur = window.listen("tauri://blur", () => {
      setIsUnfocused(true);
    });
    const unlistenFocus = window.listen("tauri://focus", () => {
      setIsUnfocused(false);
    });
    return () => {
      void unlistenBlur.then((f) => f());
      void unlistenFocus.then((f) => f());
    };
  });
}

export function useAlbumWatcher() {
  const rootDir = useRoom237((state) => state.rootDir);
  const hardRefresh = useRoom237((state) => state.hardRefresh);
  const hotRefresh = useRoom237((state) => state.hotRefresh);

  useEffect(() => {
    if (!rootDir) return;
    void hardRefresh();
  }, [rootDir, hardRefresh]);

  useEffect(() => {
    if (!rootDir) return;
    let unwatch: (() => void) | undefined;
    let refreshTimeout: NodeJS.Timeout | undefined;

    const debouncedRefresh = () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      refreshTimeout = setTimeout(() => {
        void hotRefresh();
      }, 500);
    };

    void (async () => {
      unwatch = await watchImmediate(
        rootDir,
        (event) => {
          if (typeof event.type === "string") return;
          if (
            "create" in event.type ||
            "remove" in event.type ||
            "modify" in event.type
          ) {
            debouncedRefresh();
          }
        },
        { recursive: true },
      );
    })();

    return () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      unwatch?.();
    };
  }, [rootDir, hotRefresh]);
}
