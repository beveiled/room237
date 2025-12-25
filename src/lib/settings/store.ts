"use client";

import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import {
  type AdvancedSettings,
  type AlbumSettings,
  type DuplicatesSettings,
  type FfmpegSettings,
  type MetadataSettings,
  type PrivacySettings,
  type PreloadSettings,
  type ThumbnailSettings,
  clampAdvancedSettings,
  defaultAdvancedSettings,
} from "./schema";

type AdvancedSettingsState = {
  settings: AdvancedSettings;
  loading: boolean;
  initialized: boolean;
  error?: string;
  updateField: (path: (string | number)[], value: unknown) => void;
  refresh: () => Promise<void>;
  save: () => Promise<AdvancedSettings>;
  reset: () => Promise<void>;
};

const updateObjectSection = <T extends Record<string, unknown>>(
  section: T,
  field: string | number | undefined,
  value: unknown,
): T => {
  if (typeof field !== "string") return section;
  if (!(field in section)) return section;
  return {
    ...section,
    [field]: value,
  };
};

const applyPathUpdate = (
  settings: AdvancedSettings,
  path: (string | number)[],
  value: unknown,
): AdvancedSettings => {
  const [sectionKey, fieldKey] = path;
  if (path.length === 1 && typeof sectionKey === "string") {
    switch (sectionKey) {
      case "duplicates":
        return { ...settings, duplicates: value as DuplicatesSettings };
      case "thumbnails":
        return { ...settings, thumbnails: value as ThumbnailSettings };
      case "ffmpeg":
        return { ...settings, ffmpeg: value as FfmpegSettings };
      case "preload":
        return { ...settings, preload: value as PreloadSettings };
      case "metadata":
        return { ...settings, metadata: value as MetadataSettings };
      case "album":
        return { ...settings, album: value as AlbumSettings };
      case "privacy":
        return { ...settings, privacy: value as PrivacySettings };
      default:
        return settings;
    }
  }

  if (typeof sectionKey !== "string") return settings;

  switch (sectionKey) {
    case "duplicates":
      return {
        ...settings,
        duplicates: updateObjectSection<DuplicatesSettings>(
          settings.duplicates,
          fieldKey,
          value,
        ),
      };
    case "thumbnails":
      return {
        ...settings,
        thumbnails: updateObjectSection<ThumbnailSettings>(
          settings.thumbnails,
          fieldKey,
          value,
        ),
      };
    case "ffmpeg":
      return {
        ...settings,
        ffmpeg: updateObjectSection<FfmpegSettings>(
          settings.ffmpeg,
          fieldKey,
          value,
        ),
      };
    case "preload":
      return {
        ...settings,
        preload: updateObjectSection<PreloadSettings>(
          settings.preload,
          fieldKey,
          value,
        ),
      };
    case "metadata":
      return {
        ...settings,
        metadata: updateObjectSection<MetadataSettings>(
          settings.metadata,
          fieldKey,
          value,
        ),
      };
    case "album":
      return {
        ...settings,
        album: updateObjectSection<AlbumSettings>(
          settings.album,
          fieldKey,
          value,
        ),
      };
    case "privacy":
      return {
        ...settings,
        privacy: updateObjectSection<PrivacySettings>(
          settings.privacy,
          fieldKey,
          value,
        ),
      };
    default:
      return settings;
  }
};

export const useAdvancedSettings = create<AdvancedSettingsState>(
  (set, get) => ({
    settings: defaultAdvancedSettings,
    loading: false,
    initialized: false,
    error: undefined,
    updateField: (path, value) =>
      set((state) => ({
        settings: clampAdvancedSettings(
          applyPathUpdate(state.settings, path, value),
        ),
      })),
    refresh: async () => {
      set({ loading: true });
      try {
        const incoming = await invoke<AdvancedSettings>("get_settings");
        set({
          settings: clampAdvancedSettings(incoming),
          initialized: true,
          loading: false,
          error: undefined,
        });
      } catch (error) {
        set({
          initialized: true,
          loading: false,
          error: (error as Error).message,
        });
      }
    },
    save: async () => {
      set({ loading: true });
      const payload = clampAdvancedSettings(get().settings);
      try {
        const saved = await invoke<AdvancedSettings>("update_settings", {
          settings: payload,
        });
        const normalized = clampAdvancedSettings(saved);
        set({
          settings: normalized,
          initialized: true,
          loading: false,
          error: undefined,
        });
        return normalized;
      } catch (error) {
        set({ loading: false, error: (error as Error).message });
        throw error;
      }
    },
    reset: async () => {
      set({ loading: true });
      try {
        const saved = await invoke<AdvancedSettings>("reset_settings");
        set({
          settings: clampAdvancedSettings(saved),
          initialized: true,
          loading: false,
          error: undefined,
        });
      } catch (error) {
        set({ loading: false, error: (error as Error).message });
      }
    },
  }),
);
