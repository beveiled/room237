import { exists } from "@tauri-apps/plugin-fs";
import { useCallback, useEffect, useRef } from "react";
import { useRoom237 } from "../stores";
import {
  extractPersistedState,
  loadPersistedState,
  savePersistedState,
} from "../stores/persistence";

export function useStorePersistence() {
  const isInitialized = useRef(false);
  const isLoading = useRef(false);
  const columns = useRoom237((state) => state.columns);
  const sortKey = useRoom237((state) => state.sortKey);
  const sortDir = useRoom237((state) => state.sortDir);
  const rootDir = useRoom237((state) => state.rootDir);
  const decoyRoot = useRoom237((state) => state.decoyRoot);

  const validateRoot = useCallback(async (dir: string | null) => {
    if (!dir) return false;
    if (!(await exists(dir))) return false;
    return true;
  }, []);

  useEffect(() => {
    if (isLoading.current || isInitialized.current) return;

    isLoading.current = true;
    void (async () => {
      const persisted = await loadPersistedState();
      if (persisted) {
        const {
          setColumns,
          setSortKey,
          setSortDir,
          setRootDir,
          setDecoyRoot,
          setAllowOpen,
        } = useRoom237.getState();

        if (persisted.columns !== undefined) {
          setColumns(persisted.columns);
        }
        if (persisted.sortKey !== undefined) {
          setSortKey(persisted.sortKey);
        }
        if (persisted.sortDir !== undefined) {
          setSortDir(persisted.sortDir);
        }
        if (persisted.rootDir !== undefined) {
          if (!(await validateRoot(persisted.rootDir))) {
            setRootDir(null);
          } else {
            setRootDir(persisted.rootDir);
            setAllowOpen(false);
          }
        }
        if (persisted.decoyRoot !== undefined) {
          setDecoyRoot(persisted.decoyRoot);
        }
      }

      isInitialized.current = true;
      isLoading.current = false;
    })();
  }, [validateRoot]);

  useEffect(() => {
    if (!isInitialized.current) return;

    const state = useRoom237.getState();
    const persistedState = extractPersistedState(state);
    void savePersistedState(persistedState);
  }, [columns, sortKey, sortDir, rootDir, decoyRoot]);
}
