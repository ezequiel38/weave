import { Suspense } from "react";
import { TeamRoute } from "@/components/team-route";

export default function AccountsPage({ params }: PageProps<"/t/[slug]/accounts">) {
  return (
    <Suspense>
      <TeamRoute params={params} view="accounts" />
    </Suspense>
  );
}
