import { costLimitPlugin } from "@escape.tech/graphql-armor-cost-limit";
import { maxAliasesPlugin } from "@escape.tech/graphql-armor-max-aliases";
import { maxDirectivesPlugin } from "@escape.tech/graphql-armor-max-directives";
import { maxTokensPlugin } from "@escape.tech/graphql-armor-max-tokens";
import { useCSRFPrevention } from "@graphql-yoga/plugin-csrf-prevention";
import { useDisableIntrospection } from "@graphql-yoga/plugin-disable-introspection";

export const MAX_DEPTH = 10;

/**
 * Query-shape limits applied at every stage, plus introspection disabled in
 * prod only (GraphiQL stays usable in local/dev/qa).
 */
export function buildHardeningPlugins(stage: string): unknown[] {
  const plugins: unknown[] = [
    costLimitPlugin({ maxCost: 5000 }),
    maxAliasesPlugin({ n: 15 }),
    maxDirectivesPlugin({ n: 50 }),
    maxTokensPlugin({ n: 1000 }),
    useCSRFPrevention({ requestHeaders: ["x-graphql-csrf"] }),
  ];
  if (stage === "prod") plugins.push(useDisableIntrospection());
  return plugins;
}
