import { ArrowLeft, Gift, Tag, Sparkles, Coins, Handshake, ShieldCheck } from 'lucide-react';
import './HowItWorks.css';

const costs = [
  ['Publicar una donación', 'Gratis', 'Ofrecer tu artículo no requiere créditos.'],
  ['Mantener hasta 3 ventas activas', 'Gratis', 'Sin comisión por la venta.'],
  ['Publicar otra venta cuando ya tienes 3 activas', '1 crédito', '$2.500 COP por esa publicación adicional.'],
  ['Destacar una publicación', '1 crédito', 'Opcional; no garantiza una venta ni solicitudes.'],
  ['Postularte a 2 donaciones en 24 horas', 'Gratis', 'Son 2 postulaciones por persona, no por artículo.'],
  ['Una postulación adicional a una donación', '1 crédito', 'Sujeta al límite de solicitudes pendientes.'],
];
const packs = [
  { credits: 1, price: '$2.500', unit: '$2.500', saving: null },
  { credits: 3, price: '$7.000', unit: '$2.333,33', saving: '$500' },
  { credits: 5, price: '$11.000', unit: '$2.200', saving: '$1.500' },
];
const questions = [
  ['¿MiBatute cobra una comisión si vendo?', 'No. MiBatute no descuenta un porcentaje del precio de tu artículo. El crédito se usa para una función concreta, como una publicación adicional o un destacado; no es una comisión por concretar una venta.'],
  ['¿Cuándo recupero un espacio gratuito para vender?', 'Puedes mantener hasta 3 ventas activas gratis al mismo tiempo. Al finalizar una venta liberas un espacio y puedes publicar otro artículo gratis. Si ya tienes 3 activas, una publicación adicional requiere 1 crédito.'],
  ['¿Las 24 horas se reinician a medianoche?', 'No. Se cuentan las postulaciones gratuitas de las últimas 24 horas. Si usas una hoy a las 10:00 a. m., ese espacio vuelve a estar disponible mañana a las 10:00 a. m. La pantalla te indicará cuándo puedes volver a postularte gratis.'],
  ['¿Un crédito me asegura recibir una donación?', 'No. Una postulación adicional permite solicitar otro artículo disponible. Quien dona decide a quién entregarlo: pagar un crédito no te da prioridad ni garantiza que te elijan. El artículo donado sigue siendo gratis.'],
  ['¿Por qué limitar las solicitudes?', 'Los límites ayudan a reducir las solicitudes impulsivas y el acaparamiento. Además de las 2 postulaciones gratuitas en 24 horas, hay un máximo de 3 solicitudes pendientes a la vez, incluidas las que requieren créditos.'],
  ['¿Quién paga y organiza el transporte?', 'Las personas acuerdan por el chat el lugar, la fecha y quién asume el transporte. MiBatute no presta el servicio de entrega. Si recoger un artículo genera un gasto, aclárenlo antes de aceptar: una donación gratuita no incluye transporte gratuito.'],
];

export default function HowItWorks({ onBack }) {
  return <article className="marketplace-help how-guide">
    <button type="button" onClick={onBack} className="how-back"><ArrowLeft size={17} aria-hidden="true"/> Volver a los artículos</button>
    <header className="how-intro">
      <span className="how-eyebrow">Una segunda oportunidad para tus artículos</span>
      <h1>Así funciona MiBatute</h1>
      <p>Publica lo que ya no usas, véndelo o dónalo. Empieza gratis y elige si necesitas alguna función adicional.</p>
    </header>
    <aside className="how-review" role="note"><strong>{import.meta.env.DEV ? 'Prueba local.' : 'MiBatute BETA.'}</strong> Las recargas todavía no están disponibles. Puedes usar tus créditos existentes; los paquetes de compra se muestran para revisión y aún no permiten pagos.</aside>

    <section className="how-summary" aria-label="Lo esencial">
      <div><Gift size={21} aria-hidden="true"/><span>Publicar donaciones</span><strong>Gratis</strong></div>
      <div><Tag size={21} aria-hidden="true"/><span>Ventas activas gratis</span><strong>Hasta 3 a la vez</strong></div>
      <div><Coins size={21} aria-hidden="true"/><span>Valor de 1 crédito</span><strong>$2.500 COP</strong></div>
    </section>

    <section className="how-advantage" aria-labelledby="how-advantage-title">
      <h2 id="how-advantage-title">Una alternativa a Mercado Libre, sin comisión por venta</h2>
      <p>En MiBatute no descontamos un porcentaje del precio de tu artículo cuando vendes. Tú acuerdas el precio con la otra persona. Solo usas créditos si eliges una función adicional, como publicar más ventas de las gratuitas o destacar un artículo.</p>
    </section>

    <div className="how-modes">
      <section className="how-card" aria-labelledby="how-sell">
        <div className="how-section-title"><Tag size={21} aria-hidden="true"/><h2 id="how-sell">Quiero vender</h2></div>
        <p>Publica hasta 3 artículos de venta activos al mismo tiempo, gratis y sin comisión por venta.</p>
        <ol>
          <li><strong>Crea tu publicación.</strong> Agrega fotos reales, precio, ubicación y una descripción honesta del estado del artículo.</li>
          <li><strong>Revisa a las personas interesadas.</strong> Consulta sus perfiles y acuerda los detalles por el chat de MiBatute.</li>
          <li><strong>Coordina la entrega.</strong> Confirma el acuerdo con la otra persona y marca la operación como finalizada cuando corresponda.</li>
        </ol>
        <p className="how-callout">¿Ya tienes 3 ventas activas? Publicar otra requiere <strong>1 crédito ($2.500 COP)</strong>. Al finalizar una venta liberas un espacio gratuito.</p>
      </section>
      <section className="how-card" aria-labelledby="how-donate">
        <div className="how-section-title"><Gift size={21} aria-hidden="true"/><h2 id="how-donate">Quiero donar</h2></div>
        <p>Publicar una donación es gratis. Quien recibe el artículo no paga un precio por él.</p>
        <ol>
          <li><strong>Elige «Donación» al publicar.</strong> Explica qué entregas, en qué estado está y dónde se recoge.</li>
          <li><strong>Recibe las postulaciones.</strong> Revisa los perfiles y los mensajes de quienes están interesados.</li>
          <li><strong>Elige a la persona.</strong> Tú decides a quién donar. Después coordinan la recogida por el chat y confirman la entrega.</li>
        </ol>
        <p className="how-callout">Publicar y entregar tu donación <strong>no requiere créditos</strong>. Destacarla es una opción aparte.</p>
      </section>
    </div>

    <section className="how-card how-apply" aria-labelledby="how-request">
      <div className="how-section-title"><Handshake size={21} aria-hidden="true"/><h2 id="how-request">Quiero recibir una donación</h2></div>
      <ol>
        <li><strong>Encuentra un artículo disponible.</strong> Lee su descripción, revisa la ubicación y comprueba que puedas recogerlo.</li>
        <li><strong>Postúlate y cuenta por qué te interesa.</strong> Tienes <strong>2 postulaciones gratuitas cada 24 horas</strong>, entre todas las donaciones.</li>
        <li><strong>Espera la decisión de quien dona.</strong> Postularte no reserva el artículo. Si te eligen, coordinen la entrega por el chat.</li>
      </ol>
      <div className="how-callout"><strong>¿Quieres postularte a otra?</strong> Una postulación adicional requiere 1 crédito ($2.500 COP). Se mantiene el máximo de 3 solicitudes pendientes a la vez. Usar créditos no cambia la decisión de quien dona.</div>
    </section>

    <section className="how-card how-privacy" aria-labelledby="how-privacy-title">
      <div className="how-section-title"><ShieldCheck size={21} aria-hidden="true"/><h2 id="how-privacy-title">El contacto es por el chat, por tu seguridad</h2></div>
      <p>La comunicación entre las personas de una operación se realiza únicamente por el chat de MiBatute. No mostramos automáticamente a la contraparte tu correo, teléfono ni la dirección personal de tu cuenta.</p>
      <p>Quien vende o dona decide por el chat qué datos necesita compartir para coordinar la entrega. Cada persona controla sus propios datos: no tienes que entregar tu número de teléfono para conversar.</p>
      <p className="how-callout"><strong>Tu perfil público sí es visible:</strong> nombre público, foto y calificaciones, además de la ciudad y localidad del artículo. Los datos que tú incluyas en una publicación, foto o mensaje también podrán verlos sus destinatarios. Comparte solo lo necesario y nunca envíes contraseñas, códigos de verificación o datos de tarjetas.</p>
    </section>

    <section className="how-prices" aria-labelledby="how-costs">
      <div className="how-section-title"><Coins size={21} aria-hidden="true"/><h2 id="how-costs">Qué es gratis y qué requiere créditos</h2></div>
      <p>El precio individual propuesto es <strong>$2.500 COP por crédito</strong>. Cada función de pago indicada abajo requiere un crédito independiente.</p>
      <div className="how-cost-list">{costs.map(([label,price,detail])=><div className="how-cost-row" key={label}><div><h3>{label}</h3><p>{detail}</p></div><strong className={price==='Gratis'?'how-price-free':''}>{price}</strong></div>)}</div>
      <p className="how-example"><Sparkles size={18} aria-hidden="true"/><span><strong>Ejemplo:</strong> si ya tienes 3 ventas activas, publicar una cuarta y destacarla requiere 2 créditos en total: <strong>$5.000 COP</strong>.</span></p>
      <p className="how-payment-note">Las recargas aún no están disponibles. Esta propuesta no activa pagos ni modifica tu saldo.</p>
    </section>

    <section className="how-packs" aria-labelledby="how-packs-title">
      <div className="how-section-title"><Coins size={21} aria-hidden="true"/><h2 id="how-packs-title">Elige tus cupos adicionales</h2></div>
      <p className="how-packs-intro">Un cupo adicional equivale a 1 crédito. Puedes usarlo para una publicación de venta adicional, un destacado o una postulación adicional, según los límites de cada función.</p>
      <p className="how-support-copy"><strong>Desde $2.500 COP: menos que muchos cafés de cafetería.</strong> Al comprar créditos ayudas a mantener funcionando MiBatute y sus funciones gratuitas. Comprar es opcional.</p>
      <div className="how-pack-grid">{packs.map(pack=><div className="how-pack" key={pack.credits}>
        <h3>{pack.credits} {pack.credits===1?'cupo':'cupos'}</h3>
        <p className="how-pack-credits">{pack.credits} {pack.credits===1?'crédito':'créditos'}</p>
        <p className="how-pack-price">{pack.price} <span>COP</span></p>
        <p className="how-pack-unit">{pack.unit} COP por crédito{pack.credits===3?' aprox.':''}</p>
        <p className="how-pack-saving">{pack.saving?`Ahorras ${pack.saving} COP`:'Precio individual'}</p>
        <button type="button" disabled aria-label={`Comprar ${pack.credits} ${pack.credits===1?'cupo':'cupos'}: próximamente`}>Comprar {pack.credits} {pack.credits===1?'cupo':'cupos'}</button>
        <span className="how-pack-unavailable">Próximamente</span>
      </div>)}</div>
      <p className="how-payment-note">Paquetes y descuentos propuestos, pendientes de aprobación. El ahorro se calcula frente a comprar créditos individuales a $2.500 COP. El precio del café varía según el lugar. Las compras aún no están habilitadas.</p>
    </section>

    <section className="how-faq" aria-labelledby="how-questions"><h2 id="how-questions">Antes de empezar</h2>{questions.map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section>
  </article>;
}
