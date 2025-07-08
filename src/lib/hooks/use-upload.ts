"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { isMedia } from "@/lib/utils";
import type { Album } from "@/lib/types";
import { writeFile } from "@tauri-apps/plugin-fs";
import * as path from "@tauri-apps/api/path";

export function useUpload(active: Album | null) {
  const addFilesToAlbum = useCallback(
    async (album: Album, files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => isMedia(f.name));
      if (!list.length) return;
      let done = 0;
      const id = toast.loading(
        `Adding media to "${album.name}" (${done}/${list.length})`,
        { duration: Infinity },
      );

      for (const file of list) {
        await writeFile(
          await path.join(album.path, file.name),
          new Uint8Array(await file.arrayBuffer()),
        );

        done++;
        toast.loading(
          `Adding media to "${album.name}" (${done}/${list.length})`,
          { id, duration: Infinity },
        );
      }
      toast.success(`Added ${list.length} file(s)`, { id, duration: 2000 });
    },
    [],
  );

  const uploadFilesToActive = useCallback(
    async (f: FileList | File[]) => {
      if (!active) return;
      await addFilesToAlbum(active, f);
    },
    [active, addFilesToAlbum],
  );

  return { addFilesToAlbum, uploadFilesToActive };
}
