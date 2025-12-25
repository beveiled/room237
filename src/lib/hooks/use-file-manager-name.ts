"use client";

import { useEffect } from "react";
import {
  getFileManagerName as fetchFileManagerName,
  type FileManager,
} from "@/lib/fs/albumService";
import { useRoom237 } from "@/lib/stores";

let inflight: Promise<FileManager> | null = null;

export function useFileManagerName(): FileManager | null {
  const fileManagerName = useRoom237((state) => state.fileManagerName);
  const setFileManagerName = useRoom237((state) => state.setFileManagerName);

  useEffect(() => {
    if (fileManagerName) return;
    if (!inflight) {
      inflight = fetchFileManagerName()
        .then((name) => {
          setFileManagerName(name);
          return name;
        })
        .catch(() => {
          setFileManagerName("file manager");
          return "file manager" as const;
        })
        .finally(() => {
          inflight = null;
        });
    } else {
      void inflight
        .then(setFileManagerName)
        .catch(() => setFileManagerName("file manager"));
    }
  }, [fileManagerName, setFileManagerName]);

  return fileManagerName as FileManager | null;
}
