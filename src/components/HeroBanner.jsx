import { useEffect,useRef,useState } from 'react';
import { ChevronLeft,ChevronRight } from 'lucide-react';
import { recordSponsorClick,useSponsorImpression,useSponsorSlots } from '../sponsors/publicSponsors.js';
import { sponsorCreative } from '../sponsors/model.js';
import './CarouselLayout.css';

const fallback=[{id:null,texto:'MiBatute',descripcion:'Compra, dona y da una segunda vida a tus cosas.',imagen_url:'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?q=80&w=1600&auto=format&fit=crop',badge:'Economía circular',button_text:'¿Cómo funciona?',destination:'how'}];
export default function HeroBanner({onLearnMore,onBlog,sponsorFilters}) {
  const campaigns=useSponsorSlots('hero',sponsorFilters),slides=campaigns.length?campaigns:fallback;
  const [index,setIndex]=useState(0),[paused,setPaused]=useState(false);
  const root=useRef(null),active=sponsorCreative(slides[index%slides.length],Math.floor(index/slides.length));
  useSponsorImpression(root,active.id,'hero');
  useEffect(()=>{
    if(paused||(slides.length<2&&!(active.creative_assets?.length>1)))return;
    const timer=setInterval(()=>setIndex(previous=>previous+1),6500);
    return()=>clearInterval(timer);
  },[paused,slides.length,active.creative_assets?.length]);
  const move=direction=>setIndex(previous=>previous===0&&direction<0?slides.length-1:previous+direction);
  const click=()=>{if(active.id)recordSponsorClick(active.id,'hero');};
  const internal=()=>{click();if(active.destination==='blog')(onBlog||onLearnMore)?.();else onLearnMore?.();};
  const external=active.destination==='external'&&active.enlace;
  const ctaClass='pointer-events-auto inline-flex min-h-11 max-w-full items-center justify-center rounded-lg bg-white px-5 py-2 text-sm font-black text-forest-green [overflow-wrap:anywhere] transition-colors hover:bg-treasure-gold hover:text-black sm:px-7 sm:py-3';
  return <section ref={root} aria-label="Banner principal" className="hero-banner relative mb-5 overflow-hidden rounded-lg border border-white/10 bg-forest-green shadow-sm sm:mb-8"
    onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocusCapture={()=>setPaused(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))setPaused(false);}}>
    <picture className="pointer-events-none absolute inset-0" aria-hidden="true">{active.mobile_image_url&&<source media="(max-width: 767px)" srcSet={active.mobile_image_url} />}<img src={active.imagen_url} alt="" className="h-full w-full object-cover" /></picture>
    <div className="pointer-events-none absolute inset-0 bg-black/45" aria-hidden="true" />
    {external&&<a href={active.enlace} target="_blank" rel="sponsored noopener noreferrer" onClick={click} aria-label={`Abrir anuncio: ${active.texto}`} className="absolute inset-0" />}
    <div className="hero-banner-content pointer-events-none relative px-4 py-4 sm:px-10 sm:py-7 md:px-14 md:py-8">
      <div className="hero-banner-copy flex flex-col gap-2 sm:gap-3 md:max-w-2xl"><div><span className="inline-block max-w-full rounded-full bg-treasure-gold px-3 py-1 text-xs font-black uppercase text-black [overflow-wrap:anywhere]">{active.badge}</span></div>
        <h2 className="break-words text-2xl font-black leading-tight text-white sm:text-4xl md:text-5xl">{active.texto}</h2>
        {active.descripcion&&<p className="max-w-xl break-words text-sm text-white/85 sm:text-base">{active.descripcion}</p>}
        <div className="pt-1">{external?<a href={active.enlace} target="_blank" rel="sponsored noopener noreferrer" onClick={click} className={ctaClass} aria-label={`Visitar patrocinador: ${active.texto}`}>{active.button_text}</a>:<button type="button" className={ctaClass} onClick={internal}>{active.button_text}</button>}</div>
      </div>
      {(slides.length>1||active.creative_assets?.length>1)&&<div className="hero-banner-controls pointer-events-auto mt-4 flex items-center justify-between gap-4"><div className="flex min-w-0 flex-wrap items-center gap-1">{slides.map((slide,position)=><button key={slide.id||position} type="button" onClick={()=>setIndex(position)} aria-label={`Ir al banner ${position+1}: ${slide.badge}`} aria-pressed={position===index%slides.length} className="flex h-11 w-8 items-center justify-center rounded hover:bg-white/10"><span className={`h-2 rounded-full ${position===index%slides.length?'w-6 bg-white':'w-2 bg-white/50'}`} /></button>)}</div>
        <div className="flex shrink-0 gap-2"><button type="button" aria-label="Banner anterior" title="Anterior" onClick={()=>move(-1)} className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-white"><ChevronLeft size={20} /></button><button type="button" aria-label="Siguiente banner" title="Siguiente" onClick={()=>move(1)} className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-white"><ChevronRight size={20} /></button></div>
      </div>}
    </div>
  </section>;
}
