const CONDITIONS = [
  { max: 2, label: 'Muy deteriorado', description: 'Necesita reparación importante o sirve para repuestos.', color: '#a94442', cls: 'bg-red-50 text-red-800 border-red-200' },
  { max: 4, label: 'Para reparar', description: 'Tiene fallas y requiere arreglos para funcionar.', color: '#ae5b25', cls: 'bg-orange-50 text-orange-800 border-orange-200' },
  { max: 6, label: 'Usado funcional', description: 'Funciona, con desgaste o detalles que debes describir.', color: '#8b691d', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  { max: 8, label: 'Buen estado', description: 'Funciona bien, con señales normales de uso.', color: '#557847', cls: 'bg-lime-50 text-lime-800 border-lime-200' },
  { max: 9, label: 'Casi nuevo', description: 'Funciona correctamente y tiene muy poco uso.', color: '#39704d', cls: 'bg-green-50 text-green-800 border-green-200' },
  { max: 10, label: 'Nuevo', description: 'Sin uso; indica si conserva su empaque.', color: '#28654f', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
];

export function productCondition(raw) {
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const score = Math.max(1, Math.min(10, Math.round(value)));
  return { ...CONDITIONS.find(condition => score <= condition.max), score };
}
