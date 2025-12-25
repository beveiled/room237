"use client";

import { cn } from "@/lib/utils";

type CircularProgressProps = {
  percent?: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

export function CircularProgress({
  percent = 0,
  size = 36,
  strokeWidth = 4,
  className,
}: CircularProgressProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const dash = `${clamped}, 100`;

  return (
    <svg
      className={cn("text-secondary", className)}
      viewBox="0 0 36 36"
      width={size}
      height={size}
      aria-label={`Progress: ${clamped}%`}
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
      />
      <path
        className="text-primary"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={dash}
        d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
      />
    </svg>
  );
}
