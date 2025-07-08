import { useGallery } from "@/lib/context/gallery-context";
import { Button } from "@/components/ui/button";
import { Player } from "@lottiefiles/react-lottie-player";

export default function DirectoryPicker() {
  const { rootDir, pickDirectory } = useGallery();
  if (rootDir) return null;
  return (
    <>
      <div className="h-8 w-full" data-tauri-drag-region></div>
      <div className="absolute top-0 right-0 bottom-0 left-0 m-auto flex max-w-sm flex-col items-center justify-center pb-8 text-center">
        <Player
          src="/lottie/folder.json"
          background="transparent"
          className="size-26"
          loop
          autoplay
        />
        <div className="my-2 text-lg font-semibold">
          Choose root directory for your gallery
        </div>
        <div className="text-muted-foreground mb-4 max-w-11/12 text-sm">
          All HEIC files in it will be converted to PNG. The metadata for files
          and albums will appear in the hidden files.
        </div>
        <Button onClick={pickDirectory} size="lg">
          Choose directory
        </Button>
      </div>
    </>
  );
}
