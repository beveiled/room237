/* eslint-disable @next/next/no-img-element */
"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useGallery } from "@/lib/context/gallery-context";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useState } from "react";
import ReactCrop, { type PercentCrop } from "react-image-crop";
import { Button } from "./ui/button";
import { cn, isVideo } from "@/lib/utils";
import { remove, writeFile } from "@tauri-apps/plugin-fs";
import { Loader2 } from "lucide-react";

export default function MediaViewer() {
  const { viewer, media, invalidateMedia } = useGallery();
  const [crop, setCrop] = useState<PercentCrop | undefined>(undefined);
  const [isEdit, setIsEdit] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  if (viewer.viewerIndex === null) return null;
  const item = media[viewer.viewerIndex] ?? null;
  if (!item) return null;
  const cropAndWrite = async () => {
    if (!item || !crop) return;
    const canvas = document.createElement("canvas");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = item.url;
    await img.decode();

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pixelRatio = window.devicePixelRatio;

    const cropX = (crop.x / 100) * img.naturalWidth;
    const cropY = (crop.y / 100) * img.naturalHeight;
    const cropWidth = (crop.width / 100) * img.naturalWidth;
    const cropHeight = (crop.height / 100) * img.naturalHeight;

    canvas.width = Math.floor(cropWidth * pixelRatio);
    canvas.height = Math.floor(cropHeight * pixelRatio);

    ctx.scale(pixelRatio, pixelRatio);
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(
      img,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight,
    );

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((blob) => resolve(blob!), "image/png");
    });
    const arrayBuffer = await blob.arrayBuffer();
    // Close prematurely to avoid state issues
    setIsEdit(false);
    setCrop(undefined);
    await writeFile(item.path, new Uint8Array(arrayBuffer));
    await remove(item.thumb);
    await invalidateMedia(item.name);
  };

  return (
    <Dialog open onOpenChange={viewer.close}>
      <VisuallyHidden>
        <DialogTitle>{item.name}</DialogTitle>
      </VisuallyHidden>
      <DialogContent className="bg-background/40 flex w-fit !max-w-[90vw] justify-center overflow-hidden p-0 backdrop-blur-xl">
        {isVideo(item.name) ? (
          <video
            src={item.url}
            controls
            autoPlay
            className="max-h-[90vh] max-w-[90vw]"
          />
        ) : isEdit ? (
          <div className="relative flex">
            <ReactCrop
              crop={crop}
              onChange={(_, p) => setCrop(p)}
              className="max-h-[90vh] max-w-[90vw]"
            >
              <img src={item.url} alt="media" />
            </ReactCrop>
            <div className="absolute bottom-0 mt-2 flex w-full justify-end gap-2 p-2">
              <Button
                onClick={async () => {
                  setIsSaving(true);
                  await cropAndWrite();
                  setIsSaving(false);
                }}
                size="sm"
                className={cn(
                  "text-foreground rounded-3xl bg-black/70 backdrop-blur-xl hover:bg-black/80 active:bg-black/90",
                  !crop || crop.width <= 0 || crop.height <= 0
                    ? "cursor-not-allowed opacity-50"
                    : "",
                )}
                disabled={
                  isSaving || !crop || crop.width <= 0 || crop.height <= 0
                }
              >
                {isSaving && <Loader2 />}
                Save Crop
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEdit(false);
                  setCrop(undefined);
                }}
                size="sm"
                className="text-foreground rounded-3xl bg-black/50 backdrop-blur-xl hover:bg-black/60 active:bg-black/70"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <img
            src={item.url}
            className="max-h-[90vh] max-w-[90vw]"
            alt="media"
            onClick={() => setIsEdit(!isEdit)}
          />
        )}
        <img
          src={item.thumb}
          className="absolute inset-0 -z-10 h-full w-full object-cover blur-2xl"
          alt="thumb"
        />
      </DialogContent>
    </Dialog>
  );
}
