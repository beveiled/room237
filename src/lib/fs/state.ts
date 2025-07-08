import { load, type Store } from "@tauri-apps/plugin-store";

let store: Store | null = null;

export async function getStore(): Promise<Store> {
  if (store) return store;
  store = await load("state.json");
  return store;
}
