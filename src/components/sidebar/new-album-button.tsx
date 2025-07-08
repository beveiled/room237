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
import { useGallery } from "@/lib/context/gallery-context";

export function NewAlbumButton() {
  const { createAlbum } = useGallery();
  const [open, setOpen] = useState(false);
  const [txt, setTxt] = useState("");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="w-full">
          <Plus className="h-4 w-4" /> New album
        </Button>
      </PopoverTrigger>
      <PopoverContent className="ml-16 w-64 space-y-2">
        <Input
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          placeholder="Album name"
        />
        <div className="flex gap-2">
          <Button
            disabled={!txt.trim()}
            onClick={async () => {
              await createAlbum(txt.trim());
              setTxt("");
              setOpen(false);
            }}
            className="flex-auto"
          >
            <Plus />
            Create
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setTxt("");
              setOpen(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
