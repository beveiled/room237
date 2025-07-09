import { useGallery } from "@/lib/context/gallery-context";
import { Button } from "@/components/ui/button";
import { Player } from "@lottiefiles/react-lottie-player";
import path from "path";

export default function ConfirmOpen() {
  const { rootDir, setAllowOpen, pickDirectory } = useGallery();
  if (!rootDir) return null;
  return (
    <>
      <div className="h-8 w-full" data-tauri-drag-region></div>
      <div className="absolute top-0 right-0 bottom-0 left-0 m-auto flex max-w-sm flex-col items-center justify-center pb-8 text-center">
        <Player
          src="/lottie/confirm_open.json"
          background="transparent"
          className="size-26"
          loop
          autoplay
        />
        <div className="my-2 text-xl font-semibold">We found your library</div>
        <div className="text-muted-foreground mb-4 max-w-11/12 text-sm">
          Just making sure you want to open <b>{path.basename(rootDir)}</b>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setAllowOpen(true)}>Open</Button>
          <Button onClick={pickDirectory} variant="outline">
            Pick another root
          </Button>
        </div>
      </div>
    </>
  );
}
