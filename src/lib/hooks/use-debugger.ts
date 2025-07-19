"use client";

import { useState } from "react";

export function useDebugger() {
  const [isDebug, setIsDebug] = useState(false);
  const [isLogger, setIsLogger] = useState(false);

  return { isDebug, setIsDebug, isLogger, setIsLogger };
}
