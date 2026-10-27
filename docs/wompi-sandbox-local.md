# Prueba manual de recargas en Sandbox local

Preparado el 27 de octubre de 2026. Producción y pagos reales desactivados. El usuario revisa en local antes de autorizar cualquier commit/deploy.

1. Abrir http://127.0.0.1:5174, iniciar sesión como usuario confirmado y entrar en Perfil → Recargar con Wompi.
2. Confirmar el aviso **Sandbox: prueba sin dinero real**, elegir 1, 3 o 5 créditos y pulsar Preparar pago de prueba. El total es $2.500, $7.000 o $11.000 COP.
3. Pulsar Continuar en Wompi. Usar únicamente datos de prueba. La documentación de Wompi indica tarjeta `4242 4242 4242 4242` para aprobado y `4111 1111 1111 1111` para rechazado, con vencimiento futuro y CVC de tres dígitos. No usar tarjetas o cuentas reales en esta prueba.
4. Se abre el widget oficial sin redirección a localhost (el checkout alojado devuelve 403 con ese retorno). Al terminar, el widget entrega el identificador de transacción. MiBatute verifica la transacción en el servidor y muestra el abono/saldo. Si sigue pendiente, usar Verificar pago y saldo; no volver a pagar para corregir un saldo.
5. Confirmar que repetir la comprobación no vuelve a sumar créditos. Para un rechazo, confirmar ausencia de abono y preparar otro pago con una referencia diferente. Los créditos obtenidos aquí son ficticios y solo existen en la base local.

Fuente: https://docs.wompi.co/docs/colombia/datos-de-prueba-en-sandbox/

El webhook público no puede llegar a 127.0.0.1 desde Wompi. La prueba local utiliza verificación del resultado del widget/consulta manual con la misma función de abono idempotente. Antes de recibir dinero real deben configurarse las URLs públicas de eventos por ambiente y comprobarse la recuperación de pagos que no regresan a la página. El código ya valida firmas y consulta datos canónicos del proveedor, pero esto no acredita una prueba real de recepción de eventos.

Las llaves se guardan exclusivamente en `.env.development.local`, excluido de Git y con permisos restringidos. La clave de servicio guardada es la de Supabase local. Después de cambiar llaves debe reiniciarse el servidor Vite para descartar variables antiguas en memoria. No enviar claves por correo/chat ni incorporarlas a variables VITE.

No se activaron correos automáticos ni se modificó el SMTP. La preparación no habilita cobros reales ni reemplaza la revisión de condiciones y devoluciones pendiente para producción.
