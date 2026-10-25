"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePasswordGate } from "./password-gate";

/** Refresh spends Apify/Claude credits, so it's password-locked (checked server-side). */
export function RefreshButton({ teamId, className }: { teamId: Id<"teams">; className?: string }) {
  const refresh = useAction(api.ingest.refresh);
  const runs = useQuery(api.runs.latest, { teamId });
  const gate = usePasswordGate("Refresh");
  const [starting, setStarting] = useState(false);
  const running = starting || gate.busy || runs?.[0]?.status === "running";

  return (
    <>
      <Button
        size="sm"
        className={cn("rounded-full", className)}
        disabled={running}
        onClick={() =>
          gate.run(async (password) => {
            setStarting(true);
            try {
              const res = await refresh({ teamId, password });
              if (!("locked" in res && res.locked) && !res.ok) toast.error(res.message);
              return res;
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Refresh failed");
              return {};
            } finally {
              setStarting(false);
            }
          })
        }
      >
        <RefreshCw className={cn(running && "animate-spin")} />
        {running ? "Refreshing…" : "Refresh"}
      </Button>
      {gate.dialog}
    </>
  );
}
