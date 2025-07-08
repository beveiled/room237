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
}

export interface Album {
  path: string;
  name: string;
  thumb: string | null;
  medias: MediaEntry[];
}

export type LayoutType = "default" | "masonry" | "apple";
