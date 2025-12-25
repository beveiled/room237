import { type ReactNode } from "react";
import { Debugger } from "./debugger";
import { LockOverlay } from "./lock-overlay";
import ConfirmOpen from "./sidebar/confirm-open";
import { Logger } from "./logger";
import { useRoom237 } from "@/lib/stores";

export default function AppShell({ children }: { children: ReactNode }) {
  const allowOpen = useRoom237(
    (state) => state.allowOpen || !state.confirmOpenEnabled,
  );
  const rootDir = useRoom237((state) => state.rootDir);

  return (
    <div className="relative flex min-h-screen">
      {allowOpen ? (
        <>
          {children}
          <LockOverlay />
          {rootDir && <Debugger />}
          <Logger />
        </>
      ) : (
        <ConfirmOpen />
      )}
    </div>
  );
}
