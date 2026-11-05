# Revisión de consumo y abuso — 5 de noviembre de 2026

Revisión por terminal del código y migraciones del repositorio, sin pruebas de navegador, carga contra producción, correos, pagos ni lectura de datos personales. Publicación posterior autorizada: ambas migraciones aplicadas juntas en una transacción al Supabase habitual, comparando antes las cuatro funciones originales. Nueve verificaciones posteriores positivas: cuerpos exactos, permisos conservados, RLS/contador privados, reservador privado, tres presupuestos correctos y MFA/créditos/cuota de subidas intactos. No se generaron visitas ni métricas de prueba en producción. El código se publica en main y el proyecto Vercel habitual.

## Correcciones preparadas

- **Catálogo público:** migración `2026-11-05-catalog-query-budget.sql`. Antes de ejecutar búsqueda/ranking exige filtros JSON de objeto, máximo 4096 bytes de representación, búsqueda de hasta 200 caracteres, semilla de hasta 80 y campos de ubicación/categoría de hasta 100. Rechaza tipos no textuales en esos campos. SQL NULL conserva el comportamiento de filtros vacíos. Evita procesar semillas enormes en el hash de cada fila y búsquedas desproporcionadas. No es una cuota de solicitudes ni elimina el coste del parseo HTTP/JSON previo.
- La migración conserva el cuerpo instalado de la consulta y sus filtros de verificación, búsqueda, paginación y cuadrícula. Cambia a un bloque PL/pgSQL para comprobar antes de evaluar la consulta; conserva dueño, permisos, estabilidad, search_path y ejecución sin privilegios elevados. Se detiene ante una estructura previa inesperada y permite reaplicación sin envolver de nuevo.
- **Autorización de imágenes:** las llamadas de sesión y cuota comparten un plazo de red de 15 segundos por solicitud válida. No se añade una RPC: sigue siendo la reserva existente.
- **Borrado de imágenes:** plazo de red compartido de 20 segundos desde la comprobación de sesión, manteniendo además el máximo individual de 10 segundos del proveedor. Antes cada una de hasta ocho llamadas ImageKit podía esperar diez segundos por separado. Se conserva la validación de propiedad de todos los archivos antes de cualquier borrado.
- Un archivo que responde 404 en detalles ya no provoca otro DELETE. IDs repetidos se consultan una sola vez y una lista vacía se rechaza antes de llamar a Supabase. El flujo normal del cliente ya evita listas vacías.
- **Correo manual:** cabecera Bearer estricta; formatos inválidos y arrays se rechazan antes de llamar a la base. No cambia la autenticación MFA, cola, límite diario ni calendario de correo.

Los plazos cancelan la espera y las solicitudes fetch; **no acreditan cancelación de SQL ya iniciado en el servidor** ni un límite de facturación. En borrado pueden existir éxitos parciales si el proveedor falla o vence el plazo; el reintento conserva comprobaciones de propiedad e ignora los archivos ya ausentes. No se reintenta ni se ejecuta en paralelo para aumentar el volumen.

## Controles existentes revisados

- Catálogo paginado y consultas personales con límite de 100; notificaciones con límites. La paginación acota la respuesta, pero búsqueda, conteo y ranking aún pueden recorrer muchos registros.
- Envío de avisos: GET inactivo sale sin base/proveedor, ejecución manual exige autorización administrativa, lotes de tres y presupuesto diario en SQL. No se modifica el cron existente.
- Recargas: el endpoint deshabilitado retorna antes de consultas/proveedor; webhook exige configuración y evento firmado. No se activan pagos ni se realizan pruebas de cobros.
- Avisos administrativos: un canal privado y refrescos agrupados, sin sondeo. Catálogo de ubicaciones y anuncios patrocinados reutilizan caché. Los intervalos de carruseles/relojes actualizan UI local; la comprobación de versión consulta un archivo estático, no Supabase.

## Riesgos pendientes, priorizados

1. **Alto — escrituras públicas de métricas/visitas:** `record_article_view`, `record_market_metrics` y `record_sponsor_metrics` admiten llamadas anónimas. Sus deduplicaciones/presupuestos previos dependen de IDs enviados por el cliente: un atacante puede rotarlos. Se preparó después un presupuesto global, documentado abajo, que acota nuevas reservas aun cambiando los IDs. Turnstile de Auth no protege estas RPC y sigue pendiente protección contra volumen de solicitudes directas; no se eliminan las estadísticas de visitantes como efecto de esta entrega.
2. **Alto — repetición distribuida o autenticada:** llamadas pequeñas repetidas al catálogo/borrado aún consumen recursos. La cuota de subidas limita firmas por cuenta; no cubre todos los endpoints ni muchas cuentas. Un firewall solo delante de Vercel no cubre por sí mismo las llamadas directas a Supabase. Un límite en memoria de una función tampoco constituye un límite global entre instancias.
3. **Medio — tiempo y planes de SQL:** revisar configuración efectiva de timeouts por rol y planes con datos representativos antes de cambiar índices o limitar tiempos. No se da por comprobada esa configuración de producción con esta revisión estática ni se instala un timeout de función que no limite realmente la sentencia en curso.
4. **Medio — límites y alertas del proveedor:** comprobar cuotas y avisos de gasto del plan contratado; no se cambia de plan ni se promete un techo monetario absoluto. No se agregan monitores con consultas periódicas por esta revisión.

No se encontraron pruebas que acrediten una nueva extracción de datos o exposición de secretos en los puntos revisados; esta revisión de consumo no sustituye una auditoría completa de permisos o penetración.

## Validación

Pruebas de API y presupuesto con fetch simulado: cancelación durante una llamada, no iniciar llamadas después del plazo, conservación de cancelación individual, no duplicar peticiones, rechazo temprano y evitar DELETE de archivos ausentes. Prueba SQL con PGlite sobre la consulta más reciente: resultados idénticos antes/después, filtros enormes/tipos inválidos rechazados, límites válidos aceptados, RLS para anon/autenticado, permisos y reaplicación conservados. Compilación y lint de módulos funcionales modificados correctos. Suite completa registrada en `/tmp/mibatute-resource-final-tests.log`.

Resultado final: **427 pruebas aprobadas**, cero fallos. Sin navegador ni llamadas de prueba a servicios de producción.

Para publicar: verificar la definición/propiedades de `home_article_page` en producción, aplicar la migración del catálogo y verificar permisos/resultados mediante metadatos; después publicar las APIs en el proyecto habitual. La migración no está en el seed inicial incompleto del catálogo antiguo: no debe ejecutarse allí sin las migraciones previas del catálogo actual.

## Ampliación local: presupuesto global de métricas

Por instrucción de continuar antes de commit/deploy, se preparó `2026-11-05-global-metric-budgets.sql`. Su aplicación posterior en producción fue autorizada y verificada. La base local de la aplicación no se modificó por esta etapa.

- Tres presupuestos independientes: visitas de artículos, métricas del mercado y métricas de patrocinadores. Inicialmente cada uno acepta hasta **300 unidades en cada minuto de reloj** y **10.000 en cada día calendario de Colombia**. No son ventanas móviles: puede haber dos cupos cerca del cambio de período. Las cifras corresponden a unidades reservadas, no a un precio monetario ni a un número exacto de sentencias SQL.
- Cada llamada de visita reserva una unidad; un lote reserva su número de eventos (máximo veinte), incluidos duplicados o eventos que luego se omiten. Las reservas no se devuelven por deduplicación o por artículos no contables. Si la función falla con excepción, PostgreSQL revierte la reserva junto con sus escrituras. Un lote sin cupo se omite entero; no se guarda parcialmente. Los tres tipos no pueden gastar el cupo de otro tipo.
- Al superar el cupo, se devuelve false en visitas o éxito vacío en métricas opcionales; no se bloquean navegación, publicaciones, créditos ni autenticación. Las estadísticas pueden quedar incompletas bajo ataque, concurrencia o tráfico superior a lo previsto; no deben interpretarse como un registro exhaustivo. Los clientes actuales no crean reintentos por esos retornos.
- Un atacante puede agotar el cupo y dejar sin estadísticas a visitas legítimas posteriores del mismo tipo. Es una decisión de protección de escrituras; no se presenta como identificación o bloqueo individual del atacante.
- RLS y permisos privados en `metric_write_budgets`; solo tres filas posibles, sin registros por petición, IP ni identificadores nuevos. Clientes no pueden leerlas, escribirlas, truncarlas ni ejecutar directamente el reservador. El rol de servicio y el administrador de la base pueden ajustar los límites; la migración no sobrescribe ajustes ni reinicia uso al reaplicarla. Sin nueva interfaz administrativa ni consultas periódicas.
- El control añade una lectura con bloqueo inmediato y, si acepta, una actualización corta del contador dentro de la RPC que ya se ejecutaba. No hay RPC adicional, nuevos endpoints de Vercel, servicios de pago o cron. Hay consumo adicional de CPU/escritura por reserva aceptada; se obtiene un máximo de reservas global en lugar de un crecimiento sin ese límite al rotar IDs.
- Ante una fila ocupada, `FOR UPDATE NOWAIT` omite la estadística en lugar de formar una cola. El contador y la ingestión quedan en la misma transacción. Se acota también a 24.000 bytes el lote de patrocinadores, que antes solo limitaba el número de eventos.
- Una reserva ya denegada no actualiza contadores ni extiende el período. Los campos vencidos se reinician al aceptar trabajo posterior, sin tareas de limpieza. La tabla de presupuestos permanece en tres filas; **las tablas históricas existentes no pasan a tener tamaño fijo**, y conservan sus mecanismos de limpieza previos.
- Las llamadas rechazadas todavía llegan a PostgREST/PostgreSQL. Esto no limita lecturas, tráfico entrante, parseo de JSON ni el número de llamadas, y no garantiza un techo de factura ni sustituye protección ante DDoS. La validación de tamaño tampoco elimina el coste previo de recibir/parsear la petición.

La migración mantiene cuerpos, validaciones, permisos y tipos de retorno de las tres funciones existentes, insertando el control antes del bloqueo por visita o las escrituras. Se detiene si la definición instalada no coincide con los puntos esperados. Antes de publicar, comparar sus definiciones reales con las probadas y verificar permisos; no habilitar una entrega parcial que deje otra RPC equivalente sin presupuesto.

Validación puntual: seis pruebas nuevas con las tres funciones de ingestión reales en PGlite, incluyendo IDs rotados, límites compartidos, aislamiento entre tipos, reinicio de ventanas, rechazo sin actualizar contadores, RLS/permisos, lote grande/vacío, rollback y reaplicación sin perder uso. Una prueba adicional con dos conexiones de PostgreSQL en Docker comprobó rechazo sin espera bajo bloqueo y límites atómicos; la base temporal se retiró al terminar, sin cambiar datos de la aplicación. Sin navegador ni llamadas de prueba a producción.

Resultado del conjunto ampliado: **433 pruebas aprobadas**, cero fallos. La compilación anterior sigue siendo aplicable: esta ampliación solo añade SQL, pruebas y documentación, sin nuevos cambios en el bundle del navegador o las APIs.

## Aplicación autorizada en producción

Ambas migraciones aplicadas en una transacción desde el editor SQL remoto, usado solo para administración. Las cuatro definiciones originales coincidieron con las probadas. Nueve comprobaciones posteriores positivas, sin ejecutar las RPC para generar datos de prueba.

Huellas finales: catálogo `243d9b9d8c0aaf8cb7cff7216cf5fc76`; visitas `b0d97c479c09984cf7705d9f94bfdc3e`; métricas de mercado `5c5a6c99082dca9aefa4468f60aa0eda`; patrocinadores `145549a4292dba7397a3420a603917d4`; reservador privado `61c043270bd22e265a1c0fc4efc5f6ec`.

MFA, abono de créditos y cuota de subidas conservaron sus huellas anteriores. Registro, CAPTCHA, SMTP y calendarios no se modificaron; pagos reales no se habilitaron.
