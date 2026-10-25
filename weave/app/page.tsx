import { Brain, Layers, Radar } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { HeroVisual } from "@/components/hero-visual";
import { TeamSearch } from "@/components/team-search";

const STEPS = [
  {
    icon: Radar,
    title: "Collect",
    body: "Recent posts from the accounts you approve on Instagram and TikTok, with captions, photos and videos.",
  },
  {
    icon: Brain,
    title: "Understand",
    body: "Captions and images are compared with fast rules and Elastic semantic search. Claude reviews the close calls.",
  },
  {
    icon: Layers,
    title: "Weave",
    body: "Reposts collapse, and related posts become one story. Every original photo, video and link stays one tap away.",
  },
];

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(60%_50%_at_70%_10%,oklch(0.9_0.05_330/.55),transparent),radial-gradient(50%_40%_at_10%_20%,oklch(0.9_0.05_250/.5),transparent)]" />
      <header className="relative mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
        <Logo />
        <span className="ml-auto text-xs text-muted-foreground">Built at Cal Hacks 13.0</span>
        <ThemeToggle className="ml-3" />
      </header>

      <main className="relative mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
        <section>
          <p className="inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <span className="size-1.5 rounded-full bg-emerald-500" /> One feed, no repeats
          </p>
          <h1 className="mt-5 font-display text-6xl leading-[0.95] tracking-tight text-balance sm:text-7xl">
            Many posts.
            <br />
            <em className="text-foreground/70">One story.</em>
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">
            Weave follows a team or brand across every platform, recognises when different posts cover the same moment,
            and combines them into one story. No original source is lost.
          </p>
          <div className="mt-8">
            <TeamSearch />
          </div>
        </section>
        <section className="lg:pl-4">
          <HeroVisual />
        </section>
      </main>

      <section className="relative border-t bg-card/50">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3 sm:px-6">
          {STEPS.map((s, i) => (
            <div key={s.title}>
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background">
                  <s.icon className="size-4" />
                </span>
                <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
              </div>
              <h3 className="mt-3 font-display text-2xl">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-8 text-xs text-muted-foreground sm:px-6">
          Powered by Convex · Apify · Elastic · Claude
        </p>
      </section>
    </div>
  );
}
