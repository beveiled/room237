import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  IconCircleCheck,
  IconInfoCircle,
  IconLoader2,
  IconCircleX,
} from "@tabler/icons-react";

type ToastType = "success" | "error" | "info" | "loading" | "custom";

type Toast = {
  message?: string;
  content?: ReactNode;
  type: ToastType;
  timeout?: number;
};

type ToastInternals = Omit<Toast, "timeout"> & {
  id: string;
  dismissAt: number;
};

type ToastResult = {
  id: string;
  dismiss: () => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  loading: (message: string) => void;
};

const maxToasts = 5;
const toastFadeoutTimeout = 3_000;

class Toasts {
  toasts: ToastInternals[] = [];
  listeners: ((toasts: ToastInternals[]) => void)[] = [];

  add(toast: Toast) {
    if (this.toasts.length >= maxToasts) {
      this.toasts.shift();
    }
    const toastInternal = {
      ...toast,
      id: crypto.randomUUID(),
      dismissAt: Date.now() + (toast.timeout ?? toastFadeoutTimeout),
    };
    this.toasts.push(toastInternal);
    this.notifyListeners();
    return this.createToastResult(toastInternal.id);
  }

  update(id: string, updates: Partial<Omit<Toast, "timeout">>) {
    const toast = this.toasts.find((t) => t.id === id);
    if (toast) {
      Object.assign(toast, updates);
      if (updates.type && updates.type !== "loading") {
        toast.dismissAt = Date.now() + toastFadeoutTimeout;
      }
      this.notifyListeners();
    }
  }

  remove(id: string) {
    this.toasts = this.toasts.filter((toast) => toast.id !== id);
    this.notifyListeners();
  }

  removeAll() {
    if (!this.toasts.length) return;
    this.toasts = [];
    this.notifyListeners();
  }

  private createToastResult(id: string): ToastResult {
    return {
      id,
      dismiss: () => this.remove(id),
      success: (message: string) =>
        this.update(id, { type: "success", message }),
      error: (message: string) => this.update(id, { type: "error", message }),
      info: (message: string) => this.update(id, { type: "info", message }),
      loading: (message: string) =>
        this.update(id, { type: "loading", message }),
    };
  }

  subscribe(listener: (toasts: ToastInternals[]) => void) {
    this.listeners.push(listener);
    listener([...this.toasts]);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener([...this.toasts]));
  }

  watch() {
    const interval = setInterval(() => {
      const now = Date.now();
      const hasChanged = this.toasts.some((toast) => now > toast.dismissAt);
      if (hasChanged) {
        this.toasts = this.toasts.filter((toast) => now < toast.dismissAt);
        this.notifyListeners();
      }
    }, 100);
    return () => clearInterval(interval);
  }
}

type GlobalThis = typeof globalThis & {
  _toasts_singleton_?: Toasts;
};

const toasts = (globalThis as GlobalThis)._toasts_singleton_ ?? new Toasts();
(globalThis as GlobalThis)._toasts_singleton_ = toasts;

export const toast = {
  error: (message: string): ToastResult =>
    toasts.add({ type: "error", message }),
  success: (message: string): ToastResult =>
    toasts.add({ type: "success", message }),
  info: (message: string): ToastResult => toasts.add({ type: "info", message }),
  loading: (message: string): ToastResult =>
    toasts.add({ type: "loading", message, timeout: Infinity }),
  custom: (content: ReactNode, options?: { duration?: number }): ToastResult =>
    toasts.add({
      type: "custom",
      content,
      timeout: options?.duration,
    }),
  dismiss: (id?: string) => {
    if (id) {
      toasts.remove(id);
    } else {
      toasts.removeAll();
    }
  },
};

export function ToastComponent(toast: ToastInternals) {
  const motionProps = {
    layoutId: toast.id,
    initial: { marginBottom: -64, opacity: 0 },
    animate: { marginBottom: 0, opacity: 1 },
    exit: { marginBottom: -64, opacity: 0, transition: { delay: 0.15 } },
    transition: { type: "spring", bounce: 0.2, duration: 0.3 },
  } as const;

  return (
    <motion.div
      {...motionProps}
      className="border-border bg-secondary/30 text-foreground flex w-fit items-center rounded-3xl border p-1.5 pr-3 backdrop-blur-lg"
    >
      {toast.type === "custom" ? (
        toast.content
      ) : (
        <>
          {toast.type === "success" && (
            <IconCircleCheck className="size-5 text-green-500" />
          )}
          {toast.type === "error" && (
            <IconCircleX className="size-5 text-red-500" />
          )}
          {toast.type === "info" && (
            <IconInfoCircle className="size-5 text-blue-500" />
          )}
          {toast.type === "loading" && (
            <IconLoader2 className="text-muted-foreground size-5 animate-spin" />
          )}
          <motion.div
            initial={{ width: 0, marginLeft: 0 }}
            animate={{ width: "auto", marginLeft: 6 }}
            exit={{ width: 0, marginLeft: 0 }}
            transition={{
              type: "spring",
              bounce: 0.2,
              duration: 0.3,
              delay: 0.05,
            }}
            className="overflow-hidden text-sm font-medium whitespace-pre"
          >
            {toast.message}
          </motion.div>
        </>
      )}
    </motion.div>
  );
}

export function Toaster() {
  const [currentToasts, setCurrentToasts] = useState<ToastInternals[]>([]);

  useEffect(() => {
    const unsubscribe = toasts.subscribe((updatedToasts) => {
      setCurrentToasts(updatedToasts);
    });

    const stopWatching = toasts.watch();

    return () => {
      unsubscribe();
      stopWatching();
    };
  }, []);

  return (
    <div className="fixed right-0 bottom-2 left-0 z-2147483647 m-auto flex w-fit flex-col items-center gap-1.5">
      <AnimatePresence>
        {currentToasts.map((toast) => (
          <ToastComponent key={toast.id} {...toast} />
        ))}
      </AnimatePresence>
    </div>
  );
}
