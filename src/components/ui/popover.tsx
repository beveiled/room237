"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";

const PopoverOpenContext = React.createContext(false);
export const usePopoverOpen = () => React.useContext(PopoverOpenContext);

function Popover({
  open,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  const [internal, setInternal] = React.useState<boolean>(defaultOpen ?? false);
  const isControlled = open !== undefined;
  const value = isControlled ? Boolean(open) : internal;
  const handleChange = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternal(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  return (
    <PopoverOpenContext.Provider value={value}>
      <PopoverPrimitive.Root
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={handleChange}
        {...props}
        data-slot="popover"
      >
        {children}
      </PopoverPrimitive.Root>
    </PopoverOpenContext.Provider>
  );
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContentNoPortal({
  className,
  align = "center",
  side = "bottom",
  sideOffset = 4,
  children,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const open = usePopoverOpen();
  const initial = {
    opacity: 0.4,
    scale: 0,
    ...((side === "top" &&
      align === "start" && { rotateX: -15, rotateY: 15 }) ||
      (side === "top" && align === "end" && { rotateX: -15, rotateY: -15 }) ||
      (side === "bottom" &&
        align === "start" && { rotateX: 15, rotateY: 15 }) ||
      (side === "bottom" && align === "end" && { rotateX: 15, rotateY: -15 }) ||
      {}),
  };
  const transition = {
    type: "spring",
    duration: 0.3,
    bounce: 0.2,
    opacity: { duration: 0.1 },
  } as const;

  return (
    <AnimatePresence>
      {open && (
        <PopoverPrimitive.Content
          data-slot="popover-content"
          align={align}
          sideOffset={sideOffset}
          side={side}
          forceMount={true}
          {...props}
          asChild
        >
          <motion.div
            key="select-content"
            initial={initial}
            animate={{
              opacity: 1,
              scale: 1,
              rotateX: 0,
              rotateY: 0,
            }}
            exit={{
              ...initial,
              transition: {
                ...transition,
                scale: { duration: 0.2 },
              },
            }}
            transition={transition}
            style={{ willChange: "transform, opacity" }}
            className={cn(
              "bg-background/80 text-popover-foreground relative z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-2xl border p-4 shadow-md outline-hidden backdrop-blur-lg",
              className,
            )}
          >
            {children}
          </motion.div>
        </PopoverPrimitive.Content>
      )}
    </AnimatePresence>
  );
}

function PopoverContent({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal forceMount>
      <PopoverContentNoPortal {...props} />
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverContentNoPortal,
  PopoverAnchor,
};
