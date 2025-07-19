"use client";

import { getStore } from "@/lib/fs/state";
import { useEffect, useState } from "react";

export function useDecoy() {
  const [decoyRoot, setDecoyRootInternal] = useState<string | null>(null);
  const [displayDecoy, setDisplayDecoy] = useState(false);

  useEffect(() => {
    const initializeState = async () => {
      const store = await getStore();
      const storedValue = (await store.get("decoyRoot")) as string | null;
      setDecoyRootInternal(storedValue ?? null);
    };
    void initializeState();
  }, []);

  const setDecoyRoot = async (root: string | null) => {
    setDecoyRootInternal(root);
    const store = await getStore();
    await store.set("decoyRoot", root);
    await store.save();
  };

  return { decoyRoot, setDecoyRoot, displayDecoy, setDisplayDecoy };
}
