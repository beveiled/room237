"use client";

import { useRoom237 } from "../stores";

export function useViewer() {
  const viewerIndex = useRoom237((state) => state.viewerIndex);
  const openViewer = useRoom237((state) => state.openViewer);
  const closeViewer = useRoom237((state) => state.closeViewer);
  const nextViewer = useRoom237((state) => state.nextViewer);
  const prevViewer = useRoom237((state) => state.prevViewer);

  return {
    viewerIndex,
    open: openViewer,
    close: closeViewer,
    next: nextViewer,
    prev: prevViewer,
  };
}
