"use client";

import { useRef, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const KEY = "weave.refreshPassword";

type Attempt = (password: string | undefined) => Promise<{ locked?: boolean } | object>;

/**
 * Shared lock for actions that spend credits (checked server-side against
 * REFRESH_PASSWORD). Tries the session's saved password first; prompts on "locked".
 */
export function usePasswordGate(what = "This action") {
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState("");
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const attemptRef = useRef<Attempt | null>(null);

  const isLocked = (r: { locked?: boolean } | object) => "locked" in r && !!r.locked;

  const tryWith = async (pw: string | undefined, fromPrompt: boolean) => {
    const attempt = attemptRef.current;
    if (!attempt) return;
    setBusy(true);
    try {
      const res = await attempt(pw);
      if (isLocked(res)) {
        sessionStorage.removeItem(KEY);
        setWrong(fromPrompt);
        setAsking(true);
        return;
      }
      if (pw) sessionStorage.setItem(KEY, pw);
      setAsking(false);
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  /** Run `attempt`, unlocking first if needed. */
  const run = (attempt: Attempt) => {
    attemptRef.current = attempt;
    const saved = sessionStorage.getItem(KEY);
    if (saved) return tryWith(saved, false);
    setWrong(false);
    setAsking(true);
  };

  const dialog = (
    <Dialog open={asking} onOpenChange={setAsking}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="size-4" /> {what} is locked
          </DialogTitle>
          <DialogDescription>This uses paid credits. Enter the password to continue.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (password) void tryWith(password, true);
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
          <Button type="submit" disabled={!password || busy}>
            {busy ? "Checking…" : "Unlock"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );

  return { run, busy, dialog };
}
