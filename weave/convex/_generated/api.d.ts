/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as analyze from "../analyze.js";
import type * as feed from "../feed.js";
import type * as ingest from "../ingest.js";
import type * as ingestDb from "../ingestDb.js";
import type * as lib_accountUrl from "../lib/accountUrl.js";
import type * as lib_elastic from "../lib/elastic.js";
import type * as lib_match from "../lib/match.js";
import type * as lib_normalize from "../lib/normalize.js";
import type * as pipeline from "../pipeline.js";
import type * as runs from "../runs.js";
import type * as seed from "../seed.js";
import type * as stories from "../stories.js";
import type * as teams from "../teams.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  analyze: typeof analyze;
  feed: typeof feed;
  ingest: typeof ingest;
  ingestDb: typeof ingestDb;
  "lib/accountUrl": typeof lib_accountUrl;
  "lib/elastic": typeof lib_elastic;
  "lib/match": typeof lib_match;
  "lib/normalize": typeof lib_normalize;
  pipeline: typeof pipeline;
  runs: typeof runs;
  seed: typeof seed;
  stories: typeof stories;
  teams: typeof teams;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
