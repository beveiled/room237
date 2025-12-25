export type FileMeta = {
  added: number | null;
  shoot: number | null;
  isImage: boolean;
  isVideo: boolean;
  width?: number;
  height?: number;
};

export interface MediaEntry {
  url: string;
  thumb: string;
  meta: FileMeta;
  path: string;
  name: string;
  favorite: boolean;
  albumId: string;
  albumPath: string;
  albumName: string;
}

export interface DetachedMediaEntry {
  meta: string;
  name: string;
  favorite?: boolean;
}

export interface FavoriteDetachedMediaEntry extends DetachedMediaEntry {
  albumPath: string;
  albumName: string;
  albumId: string;
}

export type LayoutType = "default" | "masonry" | "apple";
export type OS = "macos" | "other";
