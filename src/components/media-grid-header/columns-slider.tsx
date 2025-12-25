"use client";

import { Slider } from "@/components/ui/slider";
import { MAX_COLS } from "@/lib/consts";
import { useRoom237 } from "@/lib/stores";

export function ColumnsSlider() {
  const columns = useRoom237((state) => state.columns);
  const setColumns = useRoom237((state) => state.setColumns);

  return (
    <div className="w-40">
      <Slider
        value={[columns]}
        min={2}
        max={MAX_COLS}
        step={1}
        onValueChange={(v) => {
          if (v[0]) setColumns(v[0]);
        }}
      />
    </div>
  );
}
