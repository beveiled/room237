import { Button } from "@/components/ui/button";
import { LottiePlayer } from "@/lib/lottie";
import { useRootDir } from "@/lib/hooks/use-root-dir";
import { useRoom237 } from "@/lib/stores";
import { Suspense } from "react";
import { IconLoader } from "@tabler/icons-react";
import { Settings } from "../settings";
import { useI18n } from "@/lib/i18n";

export default function DirectoryPicker() {
  const { pickDirectory } = useRootDir();
  const rootDir = useRoom237((state) => state.rootDir);
  const { t } = useI18n();
  if (rootDir) return null;
  return (
    <>
      <div className="h-8 w-full" data-tauri-drag-region></div>
      <div className="absolute top-4 right-4 z-10">
        <Settings showRootControls={false} advancedSide="left" />
      </div>
      <div className="absolute top-0 right-0 bottom-0 left-0 m-auto flex max-w-sm flex-col items-center justify-center pb-8 text-center">
        <Suspense
          fallback={<IconLoader className="size-8 animate-spin opacity-50" />}
        >
          <LottiePlayer
            src="/lottie/choose_root.json"
            background="transparent"
            className="size-26 invert"
            loop
            autoplay
          />
          <div className="my-2 text-xl font-semibold">
            {t("directory.title")}
          </div>
          <div className="text-muted-foreground mb-4 max-w-11/12 text-sm">
            {t("directory.subtitle")}
          </div>
          <Button onClick={pickDirectory}>{t("directory.choose")}</Button>
        </Suspense>
      </div>
    </>
  );
}
