import { type Store } from "@tauri-apps/plugin-store";
import { getStore } from "../fs/state";
import type { State } from "./types";

const STORAGE_KEY = "room237-storage";

type PersistedState = Pick<
  State,
  "columns" | "sortKey" | "sortDir" | "rootDir" | "decoyRoot"
>;

let storePromise: Promise<Store> | null = null;
let lastSavedState: PersistedState | null = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

async function getTauriStore(): Promise<Store> {
  return (storePromise ??= getStore());
}

export async function loadPersistedState(): Promise<Partial<PersistedState> | null> {
  try {
    const store = await getTauriStore();
    const stored = await store.get<string>(STORAGE_KEY);

    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as Partial<PersistedState>;
    const hasAllFields =
      parsed.columns !== undefined &&
      parsed.sortKey !== undefined &&
      parsed.sortDir !== undefined &&
      parsed.rootDir !== undefined &&
      parsed.decoyRoot !== undefined;

    if (hasAllFields) {
      lastSavedState = parsed as PersistedState;
    }

    return parsed;
  } catch (error) {
    console.error("Failed to load persisted state:", error);
    return null;
  }
}

export async function savePersistedState(state: PersistedState): Promise<void> {
  if (
    lastSavedState &&
    JSON.stringify(lastSavedState) === JSON.stringify(state)
  ) {
    return;
  }

  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(() => {
    void (async () => {
      try {
        const store = await getTauriStore();
        const serialized = JSON.stringify(state);
        await store.set(STORAGE_KEY, serialized);
        await store.save();
        lastSavedState = { ...state };
      } catch (error) {
        console.error("Failed to save persisted state:", error);
      } finally {
        saveTimeout = null;
      }
    })();
  }, 300);
}

export function extractPersistedState(state: State): PersistedState {
  return {
    columns: state.columns,
    sortKey: state.sortKey,
    sortDir: state.sortDir,
    rootDir: state.rootDir,
    decoyRoot: state.decoyRoot,
  };
}
