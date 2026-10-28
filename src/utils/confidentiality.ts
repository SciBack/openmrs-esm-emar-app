/**
 * Reinforced confidentiality: a drug whose concept (or its order's) is restricted is not shown by name in lists to
 * users without «eMAR: View Restricted Medications».
 */
export function isRestricted(conceptUuids: Array<string | undefined>, restricted: Set<string>): boolean {
  return conceptUuids.some((uuid) => Boolean(uuid) && restricted.has(uuid));
}

export function maskedName(
  name: string,
  conceptUuids: Array<string | undefined>,
  restricted: Set<string>,
  canViewRestricted: boolean,
  restrictedLabel: string,
): { text: string; masked: boolean } {
  if (!canViewRestricted && isRestricted(conceptUuids, restricted)) {
    return { text: restrictedLabel, masked: true };
  }
  return { text: name, masked: false };
}
