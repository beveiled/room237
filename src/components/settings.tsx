"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useGallery } from "@/lib/context/gallery-context";
import { open } from "@tauri-apps/plugin-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { Folder, SettingsIcon, X } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";

export function Settings() {
  const [isOpen, setOpen] = useState(false);
  const [animate, setAnimate] = useState(false);
  const { decoy } = useGallery();

  return (
    <Popover open={isOpen} onOpenChange={() => null}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={() => {
            setAnimate(true);
            setOpen(!isOpen);
          }}
        >
          <div className="relative h-4 w-4">
            <AnimatePresence>
              {isOpen ? (
                <motion.div
                  className="absolute"
                  key="close-settings"
                  initial={{ opacity: 1, rotate: 0 }}
                  animate={{ rotate: 90 }}
                  exit={{ opacity: 0, rotate: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <X className="h-4 w-4" />
                </motion.div>
              ) : (
                <motion.div
                  className="absolute"
                  key="open-settings"
                  initial={{ opacity: 1, rotate: 0 }}
                  animate={animate ? { rotate: -90 } : {}}
                  exit={{ opacity: 0, rotate: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <SettingsIcon className="h-4 w-4" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="mb-3 font-medium">Settings</div>
        <div className="text-muted-foreground mb-1 ml-2 text-xs">
          Decoy gallery
        </div>
        {decoy.decoyRoot && (
          <div className="text-muted-foreground mb-2 ml-2 flex items-center justify-between">
            <span className="text-xs">{decoy.decoyRoot}</span>
            <Button
              variant="ghost"
              className="size-5 p-0"
              onClick={() => {
                void decoy.setDecoyRoot(null);
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        )}
        <Button
          variant="outline"
          className="mb-2 w-full"
          onClick={async () => {
            const dir = await open({ directory: true });
            if (!dir) return;
            void decoy.setDecoyRoot(dir);
          }}
        >
          <Folder />
          {decoy.decoyRoot ? "Change" : "Pick"} decoy root
        </Button>
      </PopoverContent>
    </Popover>
  );
}
