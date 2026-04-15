import type { HaAddon, HaState } from "../ha/supervisorClient.js";

export function summarizeStates(states: HaState[], limit = 200): string {
  if (!states.length) {
    return "No entities available.";
  }

  // Group by domain for better overview
  const byDomain = new Map<string, HaState[]>();
  for (const s of states) {
    const domain = s.entity_id.split(".")[0];
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain)!.push(s);
  }

  const lines: string[] = [];
  let count = 0;
  for (const [domain, entities] of [...byDomain.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const entries = entities.slice(0, Math.max(1, Math.floor(limit / byDomain.size)));
    const entryStrs = entries.map(s => `${s.entity_id}=${s.state}`);
    lines.push(`[${domain}(${entities.length})] ${entryStrs.join(", ")}`);
    count += entries.length;
    if (count >= limit) break;
  }

  return lines.join("\n");
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
