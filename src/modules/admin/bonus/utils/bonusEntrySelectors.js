export const isActiveBonusEntry = (entry) =>
  Number(entry?.revocable_quantity) > 0;
