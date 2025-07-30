"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { useGallery, type SortKey } from "@/lib/context/gallery-context";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  FoldVertical,
  Grid2X2,
  SquareStack,
  TableCellsSplit,
  Trash,
} from "lucide-react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const SORT_KEYS: Record<SortKey, { title: string; icon: IconName }> = {
  shoot: {
    title: "EXIF Date",
    icon: "camera",
  },
  added: {
    title: "Added Date",
    icon: "calendar",
  },
  name: {
    title: "Name",
    icon: "file-text",
  },
};

export default function MediaGridHeader() {
  const {
    columns,
    setColumns,
    sortKey,
    setSortKey,
    sortDir,
    setSortDir,
    activeAlbum,
    deleteAlbum,
    rootDir,
    layout,
    setLayout,
    media,
    showDuplicates,
    setShowDuplicates,
  } = useGallery();

  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!rootDir) {
    return null;
  }

  return (
    <div className="sticky top-0 z-50 pt-2 pb-1">
      <div className="bg-background/50 border-border/50 shadow-background/20 flex items-center justify-between rounded-3xl border p-1 shadow-lg backdrop-blur-lg">
        <div
          className={cn(
            "flex items-center gap-2",
            media.length === 0 && "pointer-events-none opacity-50",
          )}
        >
          <Button
            variant="outline"
            onClick={() => {
              const layouts = ["default", "masonry", "apple"] as const;
              const currentIndex = layouts.indexOf(layout);
              const nextIndex = (currentIndex + 1) % layouts.length;
              setLayout(layouts[nextIndex]!);
            }}
            className="cursor-pointer"
          >
            {layout === "default" && <Grid2X2 />}
            {layout === "masonry" && <TableCellsSplit className="rotate-90" />}
            {layout === "apple" && <FoldVertical />}
            {layout === "default" && "Grid"}
            {layout === "masonry" && "Masonry"}
            {layout === "apple" && "Apple-Style"}
          </Button>
          <Select
            value={sortKey}
            onValueChange={(value) => setSortKey(value as SortKey)}
          >
            <SelectTrigger className="cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["shoot", "added", "name"] as const).map((key) => (
                <SelectItem key={key} value={key} className="cursor-pointer">
                  <DynamicIcon
                    name={SORT_KEYS[key].icon}
                    className="text-foreground"
                  />
                  {SORT_KEYS[key].title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
          >
            {sortDir === "asc" ? <ArrowDownAZ /> : <ArrowUpAZ />}
          </Button>
          <div className="w-40">
            <Slider
              value={[columns]}
              min={2}
              max={12}
              step={1}
              onValueChange={(v) => {
                if (v[0]) setColumns(v[0]);
              }}
            />
          </div>
        </div>
        <AnimatePresence>
          {activeAlbum && (
            <div className="flex gap-2">
              <motion.div
                key="find-duplicates-button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1 }}
              >
                <Popover open={deleteOpen} onOpenChange={setDeleteOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        if (!showDuplicates) {
                          const toastId = toast.loading(
                            "Loading duplicates...",
                            { duration: Infinity },
                          );
                          await activeAlbum.loadDuplicates();
                          toast.success("Duplicates loaded", {
                            id: toastId,
                            duration: 1000,
                          });
                          setShowDuplicates(true);
                        } else {
                          setShowDuplicates(false);
                        }
                      }}
                      className={cn(
                        "transition-shadow duration-200",
                        showDuplicates &&
                          "shadow-[0_0_5px_0_var(--color-green-400)]",
                      )}
                    >
                      <SquareStack />
                      <span>
                        {showDuplicates ? "Hide Duplicates" : "Show Duplicates"}
                        <sup className="ml-0.5 inline-block">&beta;</sup>
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent>
                    <p className="text-secondary-foreground mb-4 text-sm">
                      Are you sure you want to delete the album{" "}
                      <span className="font-semibold">{activeAlbum?.name}</span>
                      ?
                    </p>
                    <p className="mb-4 text-sm font-bold text-red-500">
                      This action cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        onClick={() => activeAlbum && deleteAlbum(activeAlbum)}
                        className="flex-auto"
                      >
                        <Trash className="text-red-500" />
                        Delete
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setDeleteOpen(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </motion.div>
              <motion.div
                key="delete-album-button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1 }}
              >
                <Popover open={deleteOpen} onOpenChange={setDeleteOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="destructive"
                      onClick={() => setDeleteOpen(true)}
                    >
                      <Trash className="text-red-500" />
                      Delete album
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent>
                    <p className="text-secondary-foreground mb-4 text-sm">
                      Are you sure you want to delete the album{" "}
                      <span className="font-semibold">{activeAlbum?.name}</span>
                      ?
                    </p>
                    <p className="mb-4 text-sm font-bold text-red-500">
                      This action cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        onClick={() => activeAlbum && deleteAlbum(activeAlbum)}
                        className="flex-auto"
                      >
                        <Trash className="text-red-500" />
                        Delete
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setDeleteOpen(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
