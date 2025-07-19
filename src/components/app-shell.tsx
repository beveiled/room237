import { useGallery } from "@/lib/context/gallery-context";
import { type ReactNode } from "react";
import { Debugger } from "./debugger";
import { LockOverlay } from "./lock-overlay";
import ConfirmOpen from "./sidebar/confirm-open";
import { Logger } from "./logger";

export default function AppShell({ children }: { children: ReactNode }) {
  const { locked, allowOpen, isDebug, rootDir, isLogger, setIsLogger } =
    useGallery();
  return (
    <div className="relative flex min-h-screen">
      {allowOpen ? (
        <>
          {children}
          <LockOverlay locked={locked} />
          {rootDir && (
            <Debugger
              open={isDebug}
              rootDir={rootDir}
              isLogger={isLogger}
              setIsLogger={setIsLogger}
            />
          )}
          <Logger open={isLogger} />
        </>
      ) : (
        <ConfirmOpen />
      )}
    </div>
  );
}
