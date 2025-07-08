"use client";

import {
  CircleAlert,
  CircleCheck,
  CircleQuestionMark,
  CircleX,
  Loader2,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "dark" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group [&>li]:!bg-background/70 [&>li]:!rounded-3xl [&>li]:backdrop-blur-xl"
      style={
        {
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      icons={{
        loading: <Loader2 className="size-4 animate-spin" />,
        success: <CircleCheck className="size-4 text-green-500" />,
        error: <CircleX className="size-4 text-red-500" />,
        info: <CircleQuestionMark className="size-4 text-blue-500" />,
        warning: <CircleAlert className="size-4 text-yellow-500" />,
      }}
      {...props}
    />
  );
};

export { Toaster };
