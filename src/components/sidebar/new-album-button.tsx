"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useActiveAlbum } from "@/lib/hooks/use-active-album";
import { FAVORITES_ALBUM_ID } from "@/lib/consts";
import { useI18n } from "@/lib/i18n";
import { useRoom237 } from "@/lib/stores";

export function NewAlbumButton() {
  const createAlbum = useRoom237((state) => state.createAlbum);
  const activeAlbum = useActiveAlbum();
  const [open, setOpen] = useState(false);
  const [txt, setTxt] = useState("");
  const { t } = useI18n();
  const parentId =
    activeAlbum && activeAlbum.path !== FAVORITES_ALBUM_ID
      ? activeAlbum.albumId
      : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="w-full">
          <Plus className="h-4 w-4" /> {t("album.new")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="ml-16 w-64 space-y-2">
        <Input
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          placeholder={t("album.placeholder")}
        />
        <div className="flex gap-2">
          <Button
            disabled={!txt.trim()}
            onClick={async () => {
              await createAlbum(txt.trim(), parentId);
              setTxt("");
              setOpen(false);
            }}
            className="flex-auto"
          >
            <Plus />
            {t("album.create")}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setTxt("");
              setOpen(false);
            }}
          >
            {t("album.cancel")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
