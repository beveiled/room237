import { useGallery } from "@/lib/context/gallery-context";
import { type ReactNode } from "react";
import { LockOverlay } from "./lock-overlay";
import ConfirmOpen from "./sidebar/confirm-open";

export default function AppShell({ children }: { children: ReactNode }) {
  const { locked, allowOpen } = useGallery();
  return (
    <div className="relative flex min-h-screen">
      {allowOpen ? (
        <>
          {children}
          <LockOverlay locked={locked} />
        </>
      ) : (
        <ConfirmOpen />
      )}
    </div>
  );
}
