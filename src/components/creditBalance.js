export const CREDIT_BALANCE_CHANGED = 'mb-credit-balance-changed';

export function notifyCreditBalance(uid, saldo) {
  if (!uid || !Number.isFinite(saldo) || saldo < 0) return;
  window.dispatchEvent(new CustomEvent(CREDIT_BALANCE_CHANGED, { detail: { uid, saldo } }));
}
