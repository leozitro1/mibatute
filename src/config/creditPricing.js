// Proposed catalog for local review. Does not enable checkout or change balances.
export const CREDIT_UNIT_PRICE_COP = 2500;
export const CREDIT_PACKS = [
  { credits: 1, amountCOP: 2500 },
  { credits: 3, amountCOP: 7000 },
  { credits: 5, amountCOP: 11000 },
];
export function formatCOP(amount, maximumFractionDigits = 0) {
  return '$' + new Intl.NumberFormat('es-CO', { maximumFractionDigits }).format(amount);
}
export const CREDIT_PACKS_DESCRIPTION = CREDIT_PACKS.map(pack =>
  `${pack.credits} ${pack.credits === 1 ? 'crédito' : 'créditos'} por ${formatCOP(pack.amountCOP)} COP`
).join('; ');
