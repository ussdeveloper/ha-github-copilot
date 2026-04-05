import type { HaAddon, HaState } from "../ha/supervisorClient.js";

export function summarizeStates(states: HaState[], limit = 20): string {
  if (!states.length) {
    return "No entities available.";
  }

  return states
    .slice(0, limit)
    .map((state) => `${state.entity_id}=${state.state}`)
    .join(", ");
}

export function summarizeAddons(addons: HaAddon[], limit = 10): string {
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
