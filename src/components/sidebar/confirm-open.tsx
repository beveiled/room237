import { Button } from "@/components/ui/button";
import path from "path";
import { LottiePlayer } from "@/lib/lottie";
import { useRoom237 } from "@/lib/stores";
import { useRootDir } from "@/lib/hooks/use-root-dir";
import { Suspense } from "react";
import { IconLoader } from "@tabler/icons-react";
import { Settings } from "../settings";
import { useI18n } from "@/lib/i18n";

export default function ConfirmOpen() {
  const rootDir = useRoom237((state) => state.rootDir);
  const setAllowOpen = useRoom237((state) => state.setAllowOpen);
  const decoyRoot = useRoom237((state) => state.decoyRoot);
  const setDisplayDecoy = useRoom237((state) => state.setDisplayDecoy);
  const hotRefresh = useRoom237((state) => state.hotRefresh);
  const privacyEnabled = useRoom237((state) => state.privacyEnabled);
  const confirmOpenEnabled = useRoom237((state) => state.confirmOpenEnabled);
  const { pickDirectory } = useRootDir();
  const { t } = useI18n();

  if (!rootDir || !confirmOpenEnabled) return null;

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
            src="/lottie/confirm_open.json"
            background="transparent"
            className="size-26 invert"
            loop
            autoplay
          />
          <div className="my-2 text-xl font-semibold">
            {t("confirmOpen.title")}
          </div>
          <div
            className="text-muted-foreground mb-4 max-w-11/12 text-sm"
            dangerouslySetInnerHTML={{
              __html: t("confirmOpen.subtitle", {
                values: { folder: path.basename(rootDir) },
              }),
            }}
          />
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                if (privacyEnabled && decoyRoot) {
                  setDisplayDecoy(true);
                  void hotRefresh();
                }
                setAllowOpen(true);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setAllowOpen(true);
              }}
            >
              {t("confirmOpen.open")}
            </Button>
            <Button onClick={pickDirectory} variant="outline">
              {t("confirmOpen.pickAnother")}
            </Button>
          </div>
        </Suspense>
      </div>
    </>
  );
}
