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
  duplicates?: string[];
}

export interface DetachedMediaEntry {
  meta: string;
  name: string;
}

export type LayoutType = "default" | "masonry" | "apple";
