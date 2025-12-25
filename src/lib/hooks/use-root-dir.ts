"use client";

import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { exists } from "@tauri-apps/plugin-fs";
import { useRoom237 } from "../stores";

export function useRootDir() {
  const rootDir = useRoom237((state) => state.rootDir);
  const setRootDir = useRoom237((state) => state.setRootDir);
  const [allowOpen, setAllowOpen] = useState(true);

  const validateRoot = useCallback(async (dir: string | null) => {
    if (!dir) return false;
    if (!(await exists(dir))) return false;
    return true;
  }, []);

  useEffect(() => {
    const initializeState = async () => {
      if (!(await validateRoot(rootDir))) {
        setRootDir(null);
        return;
      }
      setAllowOpen(false);
    };
    void initializeState();
  }, [validateRoot, setRootDir, rootDir]);

  const pickDirectory = async () => {
    const dir = await open({ directory: true });
    if (!dir) return;
    setRootDir(dir);
  };

  return { pickDirectory, allowOpen, setAllowOpen };
}
