import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { subscribeHashEvents } from "@/lib/hash-events";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type HashStatus = { completed: number; total: number } | null;

export type HashingProgressState = {
  active: boolean;
  completed: number;
  total: number;
  percent: number;
};

export function useHashingStatus(): HashingProgressState {
  const [status, setStatus] = useState<HashStatus>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const clearStatus = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setStatus(null);
    };

    const scheduleClear = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(clearStatus, 5000);
    };

    const unsub = subscribeHashEvents(({ completed, total }) => {
      if (total > 0 && completed >= total) {
        clearStatus();
        return;
      }
      setStatus({ completed, total });
      scheduleClear();
    });

    return () => {
      unsub();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  return useMemo(() => {
    if (!status) {
      return { active: false, completed: 0, total: 0, percent: 0 };
    }
    const { completed, total } = status;
    const percent =
      total === 0 ? 0 : Math.min(100, Math.round((completed / total) * 100));
    const active = total - completed > 3;
    return { active, completed, total, percent };
  }, [status]);
}

export function HashingProgress({
  state,
  className,
}: {
  state: HashingProgressState;
  className?: string;
}) {
  const { t } = useI18n();
  const progress = state;

  if (!progress.active) return null;

  return (
    <div
      className={cn(
        "text-muted-foreground bg-background/80 flex items-center gap-3 rounded-full border px-3 py-2 shadow-sm backdrop-blur-lg",
        className,
      )}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        <path d="M10.7 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v4.1" />
        <AnimatePresence>
          <motion.g
            key="hashing-progress-icon"
            animate={{
              x: [2, 0, -2, 0, 2],
              y: [0, 2, 0, -2, 0],
            }}
            transition={{
              duration: 1,
              ease: "linear",
              repeat: Infinity,
            }}
          >
            <path d="m21 21-1.9-1.9" />
            <circle cx="17" cy="17" r="3" />
          </motion.g>
        </AnimatePresence>
      </svg>
      <div className="leading-tight">
        <div className="text-foreground text-xs font-semibold">
          {t("albums.hashing")}
        </div>
        {progress.total > 0 && (
          <div className="font-mono text-[11px] font-medium">
            {progress.completed} / {progress.total} ({progress.percent}%)
          </div>
        )}
      </div>
    </div>
  );
}
