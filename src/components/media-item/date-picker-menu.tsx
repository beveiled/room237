"use client";

import { Button } from "@/components/ui/button";
import { useRoom237 } from "@/lib/stores";
import { useUpload } from "@/lib/hooks/use-upload";
import { toast } from "@/components/toaster";
import { useI18n } from "@/lib/i18n";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { DateTimePicker } from "./date-time-picker";
import { extractItemFromState } from "@/lib/utils";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { isEqual } from "lodash";

export const DatePickerMenu = memo(function DatePickerMenu({
  mediaPath,
  onClose,
}: {
  mediaPath: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { updateMediaDates } = useUpload();

  const metaDates = useStoreWithEqualityFn(
    useRoom237,
    (state) => {
      const item = extractItemFromState({ state, path: mediaPath });
      return {
        shoot: item?.meta.shoot,
        added: item?.meta.added,
      };
    },
    isEqual,
  );

  const selectionCount = useRoom237((state) => state.selection.length);
  const isMulti = selectionCount > 1;

  const defaultDate = useMemo(() => {
    const base =
      metaDates.shoot ?? metaDates.added ?? Math.floor(Date.now() / 1000);
    return new Date(base * 1000);
  }, [metaDates.shoot, metaDates.added]);

  const [selectedDate, setSelectedDate] = useState<Date>(defaultDate);
  useEffect(() => setSelectedDate(defaultDate), [defaultDate]);

  const handleSubmit = useCallback(async () => {
    const state = useRoom237.getState();
    const selection = state.selection;
    const item = extractItemFromState({ state, path: mediaPath });
    const todo = selection.length > 0 ? selection : item ? [item] : [];
    const ts = selectedDate.getTime();
    if (Number.isNaN(ts)) {
      toast.error("Invalid date");
      return;
    }
    if (ts < 0) {
      toast.error("Date must be on or after 1970-01-01");
      return;
    }
    try {
      await updateMediaDates(todo, Math.floor(ts / 1000));
      toast.success("Date updated");
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error ? error.message : "Failed to update date";
      toast.error(message);
    } finally {
      onClose();
    }
  }, [selectedDate, updateMediaDates, mediaPath, onClose]);

  return (
    <motion.div
      key="date-menu"
      className="space-y-3 p-1"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.12 }}
    >
      <div className="space-y-1 px-1">
        <p className="text-sm font-semibold">{t("contextMenu.changeDate")}</p>
        <p className="text-muted-foreground text-xs">
          {isMulti
            ? t("contextMenu.applyToSelected", {
                count: selectionCount,
              })
            : t("contextMenu.pickDateTime")}
        </p>
      </div>
      <DateTimePicker value={selectedDate} onChange={setSelectedDate} />
      <div className="flex justify-end gap-2 px-1 pb-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t("contextMenu.cancel")}
        </Button>
        <Button type="button" size="sm" onClick={() => void handleSubmit()}>
          {t("contextMenu.save")}
        </Button>
      </div>
    </motion.div>
  );
});
