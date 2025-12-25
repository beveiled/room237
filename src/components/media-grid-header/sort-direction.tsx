"use client";

import { Button } from "@/components/ui/button";
import { useRoom237 } from "@/lib/stores";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownAZ, ArrowUpAZ } from "lucide-react";

export function SortDirection() {
  const sortKey = useRoom237((state) => state.sortKey);
  const sortDir = useRoom237((state) => state.sortDir);
  const setSortDir = useRoom237((state) => state.setSortDir);

  if (sortKey === "random") {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: "auto", opacity: 1 }}
        exit={{ width: 0, opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <Button
          variant="outline"
          onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
        >
          {sortDir === "asc" ? <ArrowDownAZ /> : <ArrowUpAZ />}
        </Button>
      </motion.div>
    </AnimatePresence>
  );
}
