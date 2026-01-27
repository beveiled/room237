"use client";

import { cn } from "@/lib/utils";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "framer-motion";
import { IconCheck, IconLoader2 } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LottiePlayer } from "@/lib/lottie";
import { CircularProgress } from "./ui/circular-progress";
import { useI18n } from "@/lib/i18n";

type StageKey = "conversion" | "thumbnails" | "metadata" | "idle";

type StageProgress = {
  completed: number;
  total: number;
};

type PreloadProgressPayload = {
  stage: StageKey;
  stage_progress: StageProgress;
  overall_completed: number;
  overall_total: number;
  progress: number;
  conversions: StageProgress;
  thumbnails: StageProgress;
  metadata: StageProgress;
  active_actions: number;
};

const emptyStage: StageProgress = { completed: 0, total: 0 };
const SHOW_THRESHOLD = 100;

const normalizePayload = (
  payload: Partial<PreloadProgressPayload> | null,
): PreloadProgressPayload => ({
  stage: payload?.stage ?? "idle",
  stage_progress: payload?.stage_progress ?? emptyStage,
  overall_completed: payload?.overall_completed ?? 0,
  overall_total: payload?.overall_total ?? 0,
  progress: payload?.progress ?? 0,
  conversions: payload?.conversions ?? emptyStage,
  thumbnails: payload?.thumbnails ?? emptyStage,
  metadata: payload?.metadata ?? emptyStage,
  active_actions: payload?.active_actions ?? 0,
});

export function PreloadingScreen() {
  const [isVisible, setIsVisible] = useState(false);
  const [status, setStatus] = useState<PreloadProgressPayload | null>(null);
  const startTimer = useRef<NodeJS.Timeout | null>(null);
  const idleTimer = useRef<NodeJS.Timeout | null>(null);
  const visibleRef = useRef(false);
  const hiding = useRef(false);
  const [recentActivity, setRecentActivity] = useState<
    Record<StageKey, number>
  >({
    conversion: 0,
    thumbnails: 0,
    metadata: 0,
    idle: 0,
  });
  const { t } = useI18n();

  useEffect(() => {
    visibleRef.current = isVisible;
  }, [isVisible]);

  useEffect(() => {
    let unlistenProgress: (() => void) | null = null;

    const clearTimers = () => {
      if (startTimer.current) {
        clearTimeout(startTimer.current);
        startTimer.current = null;
      }
      if (idleTimer.current) {
        clearTimeout(idleTimer.current);
        idleTimer.current = null;
      }
    };

    listen("preload-progress", (event) => {
      const payload = event.payload as PreloadProgressPayload;
      const normalized = normalizePayload(payload);
      const activeActions =
        normalized.active_actions ??
        Math.max(0, normalized.overall_total - normalized.overall_completed);
      const aboveThreshold = activeActions >= SHOW_THRESHOLD;
      const finished =
        normalized.overall_total === 0 ||
        normalized.overall_completed >= normalized.overall_total;

      if (!aboveThreshold) {
        setStatus(normalized);
        clearTimers();
        hiding.current = true;
        setIsVisible(false);
        return;
      }

      setStatus((prev) => {
        const now = Date.now();
        setRecentActivity((curr) => {
          const next = { ...curr };
          const stages = ["conversion", "thumbnails", "metadata"] as const;
          const propMap = {
            conversion: "conversions",
            thumbnails: "thumbnails",
            metadata: "metadata",
          } as const;
          stages.forEach((key) => {
            const prop = propMap[key];
            const prevCompleted = prev?.[prop]?.completed ?? 0;
            const nextCompleted = normalized[prop].completed;
            if (nextCompleted !== prevCompleted) {
              next[key] = now;
            }
          });
          return next;
        });
        return normalized;
      });

      if (idleTimer.current) {
        clearTimeout(idleTimer.current);
      }
      idleTimer.current = setTimeout(() => {
        setIsVisible(false);
        hiding.current = true;
      }, 5000);

      if (finished) {
        hiding.current = true;
        if (startTimer.current) {
          clearTimeout(startTimer.current);
          startTimer.current = null;
        }
        setIsVisible(false);
        return;
      }

      hiding.current = false;

      if (!visibleRef.current && !startTimer.current) {
        startTimer.current = setTimeout(() => {
          startTimer.current = null;
          if (!hiding.current) {
            setIsVisible(true);
          }
        }, 500);
      } else if (visibleRef.current) {
        setIsVisible(true);
      }
    })
      .then((un) => {
        unlistenProgress = un;
      })
      .catch(console.error);

    return () => {
      clearTimers();
      unlistenProgress?.();
    };
  }, []);

  const steps = useMemo(
    () => [
      {
        key: "conversion" as const,
        label: t("preload.conversion"),
        progress: status?.conversions ?? emptyStage,
      },
      {
        key: "thumbnails" as const,
        label: t("preload.thumbnails"),
        progress: status?.thumbnails ?? emptyStage,
      },
      {
        key: "metadata" as const,
        label: t("preload.metadata"),
        progress: status?.metadata ?? emptyStage,
      },
    ],
    [status?.conversions, status?.thumbnails, status?.metadata, t],
  );

  if (!isVisible || !status) {
    return null;
  }

  const overallPercent = status.progress;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="bg-background/80 pointer-events-none fixed inset-0 z-9997 flex items-center justify-center rounded-3xl backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div className="flex w-[min(500px,100%-2rem)] flex-col gap-6">
            <div className="flex items-center gap-4">
              <LottiePlayer
                src="/lottie/preloading.json"
                autoplay
                loop
                className="size-16 invert"
              />
              <div className="space-y-1">
                <h2 className="text-xl leading-tight font-semibold">
                  {t("preload.title")}
                </h2>
                <div className="flex w-full items-center gap-2">
                  <CircularProgress
                    percent={overallPercent}
                    size={24}
                    strokeWidth={4}
                  />
                  <div className="text-muted-foreground text-sm font-medium">
                    {status.overall_completed} / {status.overall_total}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[auto_1fr] gap-x-4">
              {steps.map((step, idx) => {
                const percent =
                  step.progress.total === 0
                    ? 100
                    : Math.min(
                        100,
                        Math.round(
                          (step.progress.completed / step.progress.total) * 100,
                        ),
                      );
                const isComplete =
                  step.progress.total === 0 ||
                  step.progress.completed >= step.progress.total;
                const recentMs = recentActivity[step.key] ?? 0;
                const isActive =
                  !isComplete && Date.now() - recentMs < 1500 && recentMs > 0;
                const isUpcoming = !isComplete && !isActive;

                return (
                  <div className="contents" key={step.key}>
                    <div className="relative flex flex-col items-center">
                      <div
                        className={cn(
                          "flex size-6 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                          isComplete
                            ? "bg-primary text-primary-foreground border-primary"
                            : isActive
                              ? "border-primary text-primary"
                              : "border-border text-muted-foreground",
                        )}
                      >
                        {isComplete ? (
                          <IconCheck className="size-3" />
                        ) : isActive ? (
                          <IconLoader2 className="size-3 animate-spin" />
                        ) : (
                          idx + 1
                        )}
                      </div>
                      {idx < steps.length - 1 && (
                        <div className="bg-border/60 absolute top-6 left-1/2 h-[calc(100%-1.5rem)] w-px" />
                      )}
                    </div>
                    <div
                      className={cn("pb-6", idx === steps.length - 1 && "pb-0")}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-base font-medium">
                          {step.label}
                        </div>
                        <span className="text-muted-foreground text-xs font-medium">
                          {step.progress.completed} / {step.progress.total}
                        </span>
                      </div>
                      <div className="bg-secondary mt-3 h-1 w-full overflow-hidden rounded-full">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-200",
                            isComplete
                              ? "bg-primary"
                              : isUpcoming
                                ? "bg-muted-foreground/40"
                                : "bg-primary",
                          )}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
