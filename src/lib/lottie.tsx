"use client";

import { lazy, useEffect, useState } from "react";

const LazyPlayer = lazy(() =>
  import("@lottiefiles/react-lottie-player").then((mod) => ({
    default: mod.Player,
  })),
);

export function LottiePlayer(props: React.ComponentProps<typeof LazyPlayer>) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return <LazyPlayer {...props} />;
}
