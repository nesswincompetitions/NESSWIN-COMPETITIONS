export const isActiveBonusEntry = (entry) =>
  Number(entry?.revocable_quantity) > 0;

export const hasRevokedBonusCredits = (entry) =>
  Number(entry?.revoked_quantity) > 0;

export const getBonusEntryActionState = (entry) => {
  if (isActiveBonusEntry(entry)) return 'revocable';
  if (hasRevokedBonusCredits(entry)) return 'revoked';
  return 'inactive';
};
