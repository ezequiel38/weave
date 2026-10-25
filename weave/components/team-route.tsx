"use client";

import { use } from "react";
import { TeamShell } from "./team-shell";
import { FeedView } from "./feed-view";
import { AccountsView } from "./accounts-view";

export function TeamRoute({ params, view }: { params: Promise<{ slug: string }>; view: "feed" | "accounts" }) {
  const { slug } = use(params);
  return (
    <TeamShell slug={slug}>
      {(team) => (view === "feed" ? <FeedView team={team} /> : <AccountsView team={team} />)}
    </TeamShell>
  );
}
