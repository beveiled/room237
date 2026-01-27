/* eslint-disable @next/next/no-img-element */
"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useRootDir } from "@/lib/hooks/use-root-dir";
import { open } from "@tauri-apps/plugin-dialog";
import { AnimatePresence, motion } from "framer-motion";
import {
  IconFolder,
  IconFolderOpen,
  IconSettings,
  IconShield,
  IconShieldOff,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Button } from "./ui/button";
import { useRoom237 } from "@/lib/stores";
import { AdvancedSettingsPopover } from "./advanced-settings";
import { useI18n, languageOptions } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import type { Language } from "@/lib/stores/types";

type SettingsProps = {
  showRootControls?: boolean;
  advancedSide?: "left" | "right";
  advancedAlign?: "start" | "center" | "end";
};

export function Settings({
  showRootControls = true,
  advancedSide = "right",
  advancedAlign = "start",
}: SettingsProps) {
  const [isOpen, setOpen] = useState(false);
  const [animate, setAnimate] = useState(false);
  const { pickDirectory } = useRootDir();
  const decoyRoot = useRoom237((state) => state.decoyRoot);
  const setDecoyRoot = useRoom237((state) => state.setDecoyRoot);
  const contentProtected = useRoom237((state) => state.contentProtected);
  const setContentProtected = useRoom237((state) => state.setContentProtected);
  const privacyEnabled = useRoom237((state) => state.privacyEnabled);
  const effectiveContentProtected = privacyEnabled && contentProtected;
  const language = useRoom237((state) => state.language);
  const setLanguage = useRoom237((state) => state.setLanguage);
  const { t } = useI18n();
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const flagSrc: Record<Language, string> = {
    en: "/flags/en.png",
    ru: "/flags/ru.png",
  };

  useEffect(() => {
    void getVersion()
      .then((version) => setAppVersion(version))
      .catch(() => setAppVersion(null));
  }, []);

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
                  <IconX className="h-4 w-4" />
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
                  <IconSettings className="h-4 w-4" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="mb-3 font-medium">{t("settings.title")}</div>
        {showRootControls && (
          <>
            <Button
              variant="outline"
              className="mb-3 w-full"
              onClick={() => {
                void pickDirectory();
              }}
            >
              <IconFolderOpen className="size-4" />
              {t("settings.changeRoot")}
            </Button>
            {privacyEnabled && (
              <>
                {decoyRoot && (
                  <div className="mb-2 flex flex-col gap-1">
                    <div className="text-muted-foreground text-xs">
                      {t("settings.decoyGallery")}
                    </div>
                    <div className="text-muted-foreground flex items-center justify-between">
                      <span className="text-xs">{decoyRoot}</span>
                      <Button
                        variant="ghost"
                        className="size-5 p-0"
                        onClick={() => {
                          void setDecoyRoot(null);
                        }}
                      >
                        <IconX className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
                <Button
                  variant="outline"
                  className="mb-4 w-full"
                  onClick={async () => {
                    const dir = await open({ directory: true });
                    if (!dir) return;
                    void setDecoyRoot(dir);
                  }}
                >
                  <IconFolder />
                  {decoyRoot
                    ? t("settings.changeDecoy")
                    : t("settings.pickDecoy")}
                </Button>
              </>
            )}
          </>
        )}
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            {effectiveContentProtected ? (
              <IconShield className="size-4" />
            ) : (
              <IconShieldOff className="size-4" />
            )}
            <span>{t("settings.preventScreenshots")}</span>
          </div>
          <Button
            variant={effectiveContentProtected ? "default" : "outline"}
            size="sm"
            disabled={!privacyEnabled}
            onClick={() => {
              setContentProtected(!contentProtected);
            }}
            className="h-auto py-1"
          >
            {effectiveContentProtected ? t("common.on") : t("common.off")}
          </Button>
        </div>
        {!privacyEnabled && (
          <div className="text-muted-foreground mt-1 text-xs">
            {t("settings.screenshotHint")}
          </div>
        )}
        <div className="mt-3 space-y-2">
          <div className="text-sm font-medium">{t("settings.language")}</div>
          <Select
            value={language}
            onValueChange={(value) => setLanguage(value as Language)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languageOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div className="flex items-center gap-2">
                    <img
                      src={flagSrc[opt.value]}
                      alt={opt.value}
                      width={18}
                      height={12}
                      className="rounded-sm"
                    />
                    <span>{t(`language.${opt.value}`)}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-muted-foreground mt-3 text-xs">
          Room237 {appVersion ?? "..."}
        </div>
        <AdvancedSettingsPopover
          side={advancedSide}
          align={advancedAlign}
          trigger={
            <Button variant="outline" className="mt-3 w-full">
              {t("settings.advanced")}
            </Button>
          }
        />
      </PopoverContent>
    </Popover>
  );
}
