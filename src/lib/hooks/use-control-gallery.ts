import { watchImmediate } from "@tauri-apps/plugin-fs";
import { useEffect } from "react";
import { useRoom237 } from "../stores";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function useGalleryController() {
  const rootDir = useRoom237((state) => state.rootDir);
  const setAlbums = useRoom237((state) => state.setAlbums);
  const setActiveAlbumId = useRoom237((state) => state.setActiveAlbumId);
  const setLoadingAlbumId = useRoom237((state) => state.setLoadingAlbumId);
  const setAlbumsReady = useRoom237((state) => state.setAlbumsReady);
  const setIsUnfocused = useRoom237((state) => state.setIsUnfocused);
  const privacyEnabled = useRoom237((state) => state.privacyEnabled);

  useEffect(() => {
    setAlbumsReady(false);
    setAlbums({}, []);
    setActiveAlbumId(null);
    setLoadingAlbumId(null);
  }, [rootDir, setAlbums, setActiveAlbumId, setLoadingAlbumId, setAlbumsReady]);

  useEffect(() => {
    const window = getCurrentWindow();
    const unlistenBlur = window.listen("tauri://blur", () => {
      if (privacyEnabled) {
        setIsUnfocused(true);
      }
    });
    const unlistenFocus = window.listen("tauri://focus", () => {
      setIsUnfocused(false);
    });
    return () => {
      void unlistenBlur.then((f) => f());
      void unlistenFocus.then((f) => f());
    };
  }, [privacyEnabled, setIsUnfocused]);
}

export function useAlbumWatcher() {
  const rootDir = useRoom237((state) => state.rootDir);
  const allowOpen = useRoom237((state) => state.allowOpen);
  const hardRefresh = useRoom237((state) => state.hardRefresh);
  const hotRefresh = useRoom237((state) => state.hotRefresh);

  useEffect(() => {
    if (!rootDir || !allowOpen) return;
    void hardRefresh();
  }, [rootDir, allowOpen, hardRefresh]);

  useEffect(() => {
    if (!rootDir || !allowOpen) return;
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
  }, [allowOpen, rootDir, hotRefresh]);
}
