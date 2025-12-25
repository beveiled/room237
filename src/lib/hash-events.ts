"use client";

import { listen } from "@tauri-apps/api/event";

export type HashEventPayload = {
  completed: number;
  total: number;
};

export function subscribeHashEvents(onProgress: (p: HashEventPayload) => void) {
  let unlistenProgress: (() => void) | null = null;

  const setup = async () => {
    unlistenProgress = await listen<HashEventPayload>(
      "hash-progress",
      (event) => {
        console.log(event.payload);
        onProgress(event.payload);
      },
    );
  };

  setup().catch(console.error);

  return () => {
    unlistenProgress?.();
  };
}
