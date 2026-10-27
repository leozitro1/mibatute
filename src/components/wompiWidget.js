let widgetPromise;

// Accept only the server's signed Sandbox checkout; never forward a redirect or arbitrary fields.
export function sandboxWidgetOptions(checkoutUrl) {
 const url=new URL(checkoutUrl),params=url.searchParams;
 const publicKey=params.get('public-key'),currency=params.get('currency');
 const amountInCents=Number(params.get('amount-in-cents')),reference=params.get('reference');
 const integrity=params.get('signature:integrity'),expirationTime=params.get('expiration-time');
 if(url.origin!=='https://checkout.wompi.co'||url.pathname!=='/p/'||!publicKey?.startsWith('pub_test_')||currency!=='COP'||!Number.isSafeInteger(amountInCents)||amountInCents<=0||!/^MB-[a-zA-Z0-9-]+$/.test(reference||'')||!/^[a-f0-9]{64}$/.test(integrity||'')||!(Date.parse(expirationTime)>Date.now()))throw new Error('El pago de prueba no es válido o venció. Prepara uno nuevo.');
 return {publicKey,currency,amountInCents,reference,signature:{integrity},expirationTime};
}

export function loadWompiWidget() {
 if(window.WidgetCheckout)return Promise.resolve(window.WidgetCheckout);
 if(widgetPromise)return widgetPromise;
 widgetPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  const finish=error=>{
   clearTimeout(timer);script.onload=null;script.onerror=null;
   if(error){script.remove();widgetPromise=null;reject(error);}else resolve(window.WidgetCheckout);
  };
  const timer=setTimeout(()=>finish(new Error('Wompi tardó en cargar. Intenta nuevamente.')),15000);
  script.src='https://checkout.wompi.co/widget.js';script.async=true;
  script.onload=()=>finish(window.WidgetCheckout?null:new Error('No se pudo iniciar Wompi.'));
  script.onerror=()=>finish(new Error('No se pudo cargar Wompi. Revisa tu conexión.'));
  document.head.appendChild(script);
 });
 return widgetPromise;
}
