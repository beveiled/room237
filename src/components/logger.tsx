"use client";

import { useRoom237 } from "@/lib/stores";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

interface LogEntry {
  id: number;
  type: "log" | "warn" | "error" | "info";
  message: string;
  timestamp: Date;
}

export function Logger() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logIdRef = useRef(0);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const originalConsole = useRef<Console>(null);
  const pendingLogs = useRef<LogEntry[]>([]);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const isLogger = useRoom237((state) => state.isLogger);

  const flushLogs = useCallback(() => {
    if (pendingLogs.current.length > 0) {
      setLogs((prev) => [...prev, ...pendingLogs.current]);
      pendingLogs.current = [];
    }
  }, []);

  const debouncedAddLog = useCallback(
    (logEntry: LogEntry) => {
      pendingLogs.current.push(logEntry);

      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      debounceTimer.current = setTimeout(flushLogs, 100);
    },
    [flushLogs],
  );

  useEffect(() => {
    if (!isLogger) return;
    originalConsole.current = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info,
    } as Console;

    const createLogHandler =
      (type: LogEntry["type"]) =>
      (...args: unknown[]) => {
        const message = args
          .map((arg) =>
            typeof arg === "object"
              ? JSON.stringify(arg, null, 2)
              : // eslint-disable-next-line @typescript-eslint/no-base-to-string
                String(arg),
          )
          .join(" ");

        const currentLogId = logIdRef.current++;

        debouncedAddLog({
          id: currentLogId,
          type,
          message,
          timestamp: new Date(),
        });

        originalConsole.current?.[type](...args);
      };

    console.log = createLogHandler("log");
    console.warn = createLogHandler("warn");
    console.error = createLogHandler("error");
    console.info = createLogHandler("info");

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        flushLogs();
      }

      if (originalConsole.current) {
        console.log = originalConsole.current.log;
        console.warn = originalConsole.current.warn;
        console.error = originalConsole.current.error;
        console.info = originalConsole.current.info;
      }
    };
  }, [debouncedAddLog, flushLogs, isLogger]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const getLogColor = (type: LogEntry["type"]) => {
    switch (type) {
      case "error":
        return "text-red-400";
      case "warn":
        return "text-yellow-400";
      case "info":
        return "text-blue-400";
      default:
        return "text-gray-300";
    }
  };

  return (
    <AnimatePresence>
      {isLogger && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="border-border fixed right-4 bottom-4 z-200 flex h-32 w-lg flex-col rounded-2xl border bg-black/40 shadow-2xl backdrop-blur-lg select-auto"
        >
          <div className="flex-1 space-y-1 overflow-auto p-2 font-mono text-[10px]">
            {logs.map((log) => (
              <div key={log.id} className="flex gap-2">
                <span className="shrink-0 opacity-50">
                  {log.timestamp.toLocaleTimeString()}
                </span>
                <span className={`shrink-0 ${getLogColor(log.type)}`}>
                  [{log.type.toUpperCase()}]
                </span>
                <pre
                  className={`wrap-break-word whitespace-pre-wrap ${getLogColor(log.type)}`}
                >
                  {log.message}
                </pre>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
