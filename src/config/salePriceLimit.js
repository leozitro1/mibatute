// Valores oficiales sin auxilio de transporte. Añadir cada vigencia junto a su migración SQL.
export const MINIMUM_WAGES_COP = Object.freeze({2026: 1750905});
export function salePriceLimit(date = new Date(), wages = MINIMUM_WAGES_COP) {
  const year = Number(new Intl.DateTimeFormat('en', {timeZone: 'America/Bogota', year: 'numeric'}).format(date));
  const wageYear = Object.keys(wages).map(Number).filter(value => value <= year).sort((a,b) => b-a)[0];
  if (!wageYear) throw new Error('No hay salario mínimo configurado para esta fecha.');
  return {year: wageYear, amount: Math.floor(wages[wageYear] / 2)};
}
const current = salePriceLimit();
export const MAX_VENTA_COP = current.amount;
export const SALE_PRICE_LIMIT_LABEL = `medio salario mínimo mensual (${MAX_VENTA_COP.toLocaleString('es-CO')} COP en ${current.year})`;
export const SALE_PRICE_ERROR = `El precio debe ser mayor a $0 y no superar $${MAX_VENTA_COP.toLocaleString('es-CO')} COP (medio salario mínimo mensual).`;
