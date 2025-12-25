"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

export const LottiePlayer = dynamic(
  () => import("@lottiefiles/react-lottie-player").then((mod) => mod.Player),
  {
    loading: () => <Loader2 className="size-4 animate-spin" />,
    ssr: false,
  },
);
