// Presentation only: keep message text as plain text and never render stored HTML.
export function messageSections(text) {
  return String(text || '').replace(/\r\n?/g, '\n').trim()
    .split(/\n+|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/u)
    .filter(Boolean)
    .map(text => {
      const field = /^(Asunto|Motivo|Referencia|Total pagado|Valor simulado|Saldo(?: actual| después de la compensación| despues de la compensacion)?|Créditos|Creditos|Artículo|Articulo|Fecha):\s+(.+)$/iu.exec(text);
      return field ? { label: field[1], text: field[2] } : { text };
    });
}
