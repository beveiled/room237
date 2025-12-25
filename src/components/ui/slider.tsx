"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { AnimatePresence, motion, type Transition } from "framer-motion";

import { cn } from "@/lib/utils";

const springTransition = {
  type: "spring",
  stiffness: 700,
  damping: 25,
} as Transition;

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max],
  );

  return (
    <div className="w-full px-2">
      <SliderPrimitive.Root
        data-slot="slider"
        defaultValue={defaultValue}
        value={value}
        min={min}
        max={max}
        className={cn(
          "relative flex w-full touch-none items-center py-2 select-none data-disabled:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
          className,
        )}
        {...props}
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={cn(
            "bg-muted relative grow overflow-hidden rounded-full data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5",
          )}
        >
          <SliderPrimitive.Range
            data-slot="slider-range"
            className={cn(
              "bg-primary absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full",
            )}
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb data-slot="slider-thumb" key={index} asChild>
            <motion.div
              className="border-primary bg-background ring-ring/50 block shrink-0 cursor-grab rounded-full border px-2 py-px text-xs shadow-sm transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden active:cursor-grabbing disabled:pointer-events-none disabled:opacity-50"
              whileHover={{
                scale: 1.1,
                boxShadow: "0 0 0 4px rgba(var(--ring) / 0.5)",
              }}
              whileTap={{ scale: 0.95 }}
              whileFocus={{
                scale: 1.05,
                boxShadow: "0 0 0 4px rgba(var(--ring) / 0.5)",
              }}
              transition={springTransition}
            >
              {_values[index]}
            </motion.div>
          </SliderPrimitive.Thumb>
        ))}
        <AnimatePresence>
          {!value?.some((v) => v === min) && (
            <motion.div
              className="text-muted-foreground absolute bottom-2 left-1.5 -translate-x-full translate-y-full text-[10px]"
              key="label-min"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.1 }}
            >
              {min}
            </motion.div>
          )}
          {!value?.some((v) => v === max) && (
            <motion.div
              className="text-muted-foreground absolute top-2 right-1.5 translate-x-full -translate-y-full text-[10px]"
              key="label-max"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.1 }}
            >
              {max}
            </motion.div>
          )}
        </AnimatePresence>
      </SliderPrimitive.Root>
    </div>
  );
}

export { Slider };
