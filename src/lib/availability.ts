export const AVAILABILITY_MODES = ["available_only", "unavailable_only", "both"] as const;

export type AvailabilityMode = (typeof AVAILABILITY_MODES)[number];
export type AvailabilityStatus = "available" | "unavailable";

export const DEFAULT_AVAILABILITY_MODE: AvailabilityMode = "both";

export const AVAILABILITY_MODE_OPTIONS: ReadonlyArray<{
  value: AvailabilityMode;
  label: string;
  description: string;
}> = [
  {
    value: "available_only",
    label: "Disponibilidade",
    description: "Cada pessoa informa os dias em que pode servir.",
  },
  {
    value: "unavailable_only",
    label: "Indisponibilidade",
    description: "Cada pessoa informa somente os dias em que não pode servir.",
  },
  {
    value: "both",
    label: "Os dois",
    description: "A equipe pode confirmar disponibilidade ou registrar impedimentos.",
  },
];

export function normalizeAvailabilityMode(value: unknown): AvailabilityMode {
  if (value === "available_only" || value === "availability") return "available_only";
  if (value === "unavailable_only" || value === "unavailability") return "unavailable_only";
  return DEFAULT_AVAILABILITY_MODE;
}

export function defaultAvailabilityStatus(mode: AvailabilityMode): AvailabilityStatus {
  return mode === "unavailable_only" ? "unavailable" : "available";
}

export function isAvailabilityStatusAllowed(
  mode: AvailabilityMode,
  status: AvailabilityStatus,
): boolean {
  return (
    mode === "both" ||
    (mode === "available_only" && status === "available") ||
    (mode === "unavailable_only" && status === "unavailable")
  );
}

export function activeAvailabilityStatus(
  mode: AvailabilityMode,
  status: AvailabilityStatus | null | undefined,
): AvailabilityStatus | undefined {
  return status && isAvailabilityStatusAllowed(mode, status) ? status : undefined;
}

/**
 * In positive-only and mixed workflows, a missing response is a conflict.
 * In negative-only workflows, an unmarked date means there is no known impediment.
 */
export function hasAvailabilityConflict(
  mode: AvailabilityMode,
  status: AvailabilityStatus | null | undefined,
): boolean {
  const activeStatus = activeAvailabilityStatus(mode, status);
  if (mode === "unavailable_only") return activeStatus === "unavailable";
  return activeStatus !== "available";
}

/**
 * Keeps the existing scheduling fallback: before anyone confirms availability,
 * unmarked members remain selectable. As soon as positive responses exist,
 * positive-only/mixed workflows prioritize those responses. Explicit blocks
 * are never selectable.
 */
export function isMemberEligibleForLineup(
  mode: AvailabilityMode,
  status: AvailabilityStatus | null | undefined,
  hasAvailableResponses: boolean,
): boolean {
  const activeStatus = activeAvailabilityStatus(mode, status);
  if (activeStatus === "unavailable") return false;
  if (mode === "unavailable_only") return true;
  if (activeStatus === "available") return true;
  return !hasAvailableResponses;
}

export function availabilityPageDescription(mode: AvailabilityMode): string {
  if (mode === "available_only") {
    return "Marque os dias em que você pode servir e veja as confirmações da equipe.";
  }
  if (mode === "unavailable_only") {
    return "Marque somente os dias em que você não pode servir e veja os impedimentos da equipe.";
  }
  return "Confirme os dias em que pode servir ou registre quando estiver indisponível.";
}

export function personalAvailabilityLabel(mode: AvailabilityMode): string {
  if (mode === "available_only") return "Minha disponibilidade";
  if (mode === "unavailable_only") return "Minha indisponibilidade";
  return "Minha agenda";
}
