"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { toast } from "sonner";
import { Lock, RefreshCw } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const KEY = "weave.refreshPassword";

/** Refresh spends Apify/Claude credits, so it's password-locked (checked server-side). */
export function RefreshButton({ teamId, className }: { teamId: Id<"teams">; className?: string }) {
  const refresh = useAction(api.ingest.refresh);
  const runs = useQuery(api.runs.latest, { teamId });
  const [starting, setStarting] = useState(false);
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState("");
  const [wrong, setWrong] = useState(false);
  const running = starting || runs?.[0]?.status === "running";

  const start = async (pw: string | null) => {
    setStarting(true);
    try {
      const res = await refresh({ teamId, password: pw ?? undefined });
      if ("locked" in res && res.locked) {
        sessionStorage.removeItem(KEY);
        setWrong(pw !== null);
        setAsking(true);
        return;
      }
      if (pw) sessionStorage.setItem(KEY, pw);
      setAsking(false);
      setPassword("");
      if (!res.ok) toast.error(res.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        className={cn("rounded-full", className)}
        disabled={running}
        onClick={() => {
          const saved = sessionStorage.getItem(KEY);
          if (saved) void start(saved);
          else {
            setWrong(false);
            setAsking(true);
          }
        }}
      >
        <RefreshCw className={cn(running && "animate-spin")} />
        {running ? "Refreshing…" : "Refresh"}
      </Button>

      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="size-4" /> Refresh is locked
            </DialogTitle>
            <DialogDescription>Fetching new posts uses paid credits. Enter the password to continue.</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (password) void start(password);
            }}
          >
            <Input
              type="password"
              autoFocus
              placeholder="Password"
              value={password}
              aria-invalid={wrong}
              onChange={(e) => {
                setPassword(e.target.value);
                setWrong(false);
              }}
            />
            {wrong && <p className="text-xs text-destructive">Wrong password.</p>}
            <Button type="submit" disabled={!password || starting}>
              {starting ? "Checking…" : "Unlock & refresh"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
