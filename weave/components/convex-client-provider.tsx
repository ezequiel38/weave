"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = url ? new ConvexReactClient(url) : null;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) {
    return (
      <div className="mx-auto max-w-md p-10 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Convex isn&apos;t configured.</p>
        <p className="mt-2">
          Set <code>NEXT_PUBLIC_CONVEX_URL</code> (run <code>npx convex dev</code>) and reload.
        </p>
      </div>
    );
  }
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
