import { Suspense } from "react";
import { TeamRoute } from "@/components/team-route";

export default function TeamFeedPage({ params }: PageProps<"/t/[slug]">) {
  return (
    <Suspense>
      <TeamRoute params={params} view="feed" />
    </Suspense>
  );
}
