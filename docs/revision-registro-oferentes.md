# Revisión del registro de oferentes — 10 de noviembre de 2026

**Resultado:** el flujo de ventas revisado no exige un registro completo de oferentes. La verificación del correo para publicar y la verificación manual opcional de la cuenta ya existen, pero cumplen funciones diferentes.

Para un portal de contacto, el [artículo 53 de la Ley 1480](https://www.cancilleria.gov.co/normograma/compilacion/docs/ley_1480_2011.htm) prevé un registro con los datos de identificación del oferente y su consulta por compradores para quejas o reclamos, así como su entrega a la autoridad competente cuando los solicite. La revisión del papel de MiBatute según su operación real sigue abierta.

| Dato | Qué hace hoy MiBatute | Qué falta |
|---|---|---|
| Nombre o razón social | El alta recoge nombre de perfil. La verificación opcional pide el nombre de la cédula. | Confirmar el nombre legal o la razón social para la venta. |
| Documento de identificación | La verificación opcional recoge número y fecha de expedición. Publicar una venta no exige completar esa verificación. | Recoger el identificador aplicable con finalidad de registro de oferentes. |
| Dirección física de notificaciones | El perfil admite una dirección opcional. El anuncio exige ciudad, localidad y referencia general del artículo. | Confirmar una dirección física para notificaciones; la ubicación pública del artículo cumple otro propósito. |
| Teléfono | El alta comprueba que el celular tenga diez dígitos. | Confirmar que el número del perfil es el contacto del oferente. |

Evidencia: [`authService.js`](../src/supabase/authService.js), [`UserProfile.jsx`](../src/components/UserProfile.jsx), [`AccountVerification.jsx`](../src/components/AccountVerification.jsx), [`PublishModal.jsx`](../src/components/PublishModal.jsx) y la [función de publicación](../supabase/migrations/2026-11-03-article-location-reference.sql). En el código revisado, el servidor comprueba sesión, correo confirmado, estado de la cuenta y datos del anuncio, sin exigir los cuatro datos como un registro de vendedor. Esta revisión del repositorio no inspeccionó datos de usuarios ni ejecutó operaciones en producción.

## Siguiente cambio propuesto

1. Pedir al oferente, antes de su primera venta, que complete o confirme esos cuatro datos en un formulario privado con su finalidad y canal para actualizarlos. Permitir que confirme teléfono y dirección ya ingresados; conservar la verificación de cuenta como función aparte. No pedir fotos del documento ni fecha de expedición para este registro por defecto.
2. Validar el registro en el servidor antes de crear una venta, cambiar una donación a venta o volver a activar una oferta, sin subir imágenes ni descontar créditos si faltan datos. Acordar por separado la transición de ofertas existentes; este paso no las pausa. Los compradores pueden seguir registrándose sin entregar datos de oferente.
3. Tramitar solicitudes de acceso a los datos desde soporte, comprobando identidad y compra cuando se trate de un reclamo, o la competencia de la autoridad. Registrar quién consultó o entregó la información y por qué, evitando duplicar documento, dirección y teléfono en notas o registros de actividad. Mantener los datos fuera de anuncios, perfiles públicos y chats.
4. Alinear Privacidad y la nota del perfil con el acceso legal por solicitud: hoy el perfil dice que esos datos son solo de uso interno, mientras Términos contempla su entrega en casos justificados. Definir conservación y acceso antes de habilitar la captura real.

Pruebas previstas: venta sin registro rechazada; venta con registro completo aceptada; conversión y reactivación sujetas al control; datos inaccesibles para cuentas ajenas; reclamo gestionado con evidencia; sin cargos ni subidas cuando falta el registro. La revisión no activa ningún requisito ni cambia las ventas existentes.

## Vista previa implementada en local

- Al elegir **Publicar → Venta → Continuar**, quien aún no tiene registro completa nombre legal, tipo y número de identificación, dirección de notificaciones y teléfono. El formulario sugiere los datos del perfil para que se confirmen o corrijan. Se puede volver a editar desde **Mi perfil**. Guarda el aviso `seller-2026-11-10.1` y la fecha del servidor. No usa la cédula de la verificación opcional, no pide fotos ni fecha de expedición, ni muestra los datos en anuncios.
- La [migración](../supabase/migrations/2026-11-10-seller-registration.sql) instala el control apagado por defecto. La vista previa requiere `VITE_SELLER_REGISTRATION_PREVIEW=true` en Vite de desarrollo con servicios locales y Supabase en loopback, y el control encendido solo en la base local. Para revisarla, usar datos ficticios. La comprobación antes de subir fotos no se aplica a donaciones. El servidor vuelve a validar nuevas ventas, conversiones y reactivaciones, manteniendo cancelaciones y entregas en curso.
- Migración instalada y control activado solo en `supabase_db_mibatute`. Se verificaron el control, RLS y la ausencia de lectura directa autenticada; no se ingresaron datos personales de vendedores en esa base. La suite dirigida confirma que el rechazo de una venta no deja publicación, recibo ni débito, y que otra cuenta no ve el documento registrado.
- Vista previa iniciada en `http://127.0.0.1:5174/`, comprobada por HTTP con Supabase local. Para reiniciarla: `VITE_SELLER_REGISTRATION_PREVIEW=true npm run dev -- --port 5174`. Pasaron 24 pruebas dirigidas. La suite completa conserva un fallo previo en `sale-transaction.test.js`: espera que un error mencione Supabase, pero el código ya oculta ese detalle.
- Antes de habilitar en producción: acordar transición de ventas existentes, definir conservación y gestión de reclamos, revisar el aviso y publicar una nueva versión de Privacidad. La prueba local no activa captura ni bloqueo de ventas en producción.

La [propuesta de transición y atención de reclamos](transicion-y-reclamos-de-oferentes.md) describe el corte de catálogo, el manejo de reservas en curso y el acceso a datos por caso. Incluye una consulta de inventario agregado para medir el impacto sin ver datos de vendedores.
