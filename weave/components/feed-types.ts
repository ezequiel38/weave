import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

export type UnifiedStory = FunctionReturnType<typeof api.feed.unified>[number];
export type StoryPost = UnifiedStory["posts"][number];
export type RawPost = FunctionReturnType<typeof api.feed.raw>[number];
