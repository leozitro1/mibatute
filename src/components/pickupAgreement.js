export const PICKUP_TIME_ZONE = "America/Bogota";

export function bogotaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PICKUP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = type => parts.find(part => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function validatePickupSlot(date, start, end, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start)
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || start >= end) {
    return "Elige un dia y una franja horaria valida del mismo dia.";
  }
  // Bogota uses UTC-5 year-round; database validation remains authoritative.
  const timestamp = Date.parse(`${date}T${start}:00-05:00`);
  if (!Number.isFinite(timestamp) || bogotaDate(new Date(timestamp)) !== date) {
    return "Elige una fecha valida.";
  }
  return timestamp > now ? "" : "La recogida debe comenzar en el futuro (hora de Bogota).";
}

export function formatPickupSlot(pickup) {
  const date = new Date(`${pickup.pickup_date}T12:00:00-05:00`);
  return `${date.toLocaleDateString("es-CO", {
    timeZone: PICKUP_TIME_ZONE, day: "numeric", month: "short", year: "numeric",
  })} · ${pickup.start_time.slice(0, 5)} - ${pickup.end_time.slice(0, 5)}`;
}

export const pickupStatusLabel = {
  pending: "Pendiente", confirmed: "Confirmada", rejected: "Rechazada",
  canceled: "Cancelada", replaced: "Reemplazada", completed: "Completada",
};
