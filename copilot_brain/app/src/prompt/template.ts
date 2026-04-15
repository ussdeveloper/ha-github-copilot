import type { HaAddon, HaState } from "../ha/supervisorClient.js";

export function summarizeStates(states: HaState[]): string {
  if (!states.length) {
    return "No entities available.";
  }

  // Compact domain summary — just counts, agent uses tools for details
  const byDomain = new Map<string, number>();
  for (const s of states) {
    const domain = s.entity_id.split(".")[0];
    byDomain.set(domain, (byDomain.get(domain) ?? 0) + 1);
  }

  const domainParts = [...byDomain.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([domain, count]) => `${domain}(${count})`);

  return `${states.length} entities: ${domainParts.join(", ")}`;
}

export function summarizeAddons(addons: HaAddon[], limit = 50): string {
  if (!addons.length) {
    return "No add-ons available.";
  }

  return addons
    .slice(0, limit)
    .map((addon) => `${addon.slug}(${addon.state ?? "unknown"})`)
    .join(", ");
}

export function renderSystemPrompt(
  template: string,
  context: { entitiesSummary: string; addonsSummary: string; userPrompt?: string },
): string {
  return template
    .replaceAll("{{entities_summary}}", context.entitiesSummary)
    .replaceAll("{{addons_summary}}", context.addonsSummary)
    .replaceAll("{{user_prompt}}", context.userPrompt ?? "");
}
