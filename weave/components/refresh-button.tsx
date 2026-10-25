"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function RefreshButton({ teamId, className }: { teamId: Id<"teams">; className?: string }) {
  const refresh = useAction(api.ingest.refresh);
  const runs = useQuery(api.runs.latest, { teamId });
  const [starting, setStarting] = useState(false);
  const running = starting || runs?.[0]?.status === "running";

  return (
    <Button
      size="sm"
      className={cn("rounded-full", className)}
      disabled={running}
      onClick={async () => {
        setStarting(true);
        try {
          const res = await refresh({ teamId });
          if (!res.ok) toast.error(res.message);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Refresh failed");
        } finally {
          setStarting(false);
        }
      }}
    >
      <RefreshCw className={cn(running && "animate-spin")} />
      {running ? "Refreshing…" : "Refresh"}
    </Button>
  );
}
