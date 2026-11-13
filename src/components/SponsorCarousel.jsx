import ContactButton from './ContactButton.jsx';
import { useEffect,useRef,useState } from 'react';
import { recordSponsorClick,useSponsorImpression,useSponsorSlots } from '../sponsors/publicSponsors.js';
import { sponsorCreative } from '../sponsors/model.js';
import './CarouselLayout.css';

export default function SponsorCarousel({sponsorFilters}) {
  const sponsors=useSponsorSlots('footer',sponsorFilters);
  const [index,setIndex]=useState(0),[hovered,setHovered]=useState(false),[focused,setFocused]=useState(false);
  const root=useRef(null),sponsor=sponsors.length?sponsorCreative(sponsors[index%sponsors.length],Math.floor(index/sponsors.length)):null;
  useSponsorImpression(root,sponsor?.id,'footer');
  useEffect(()=>{
    if(hovered||focused||(sponsors.length<2&&!(sponsor?.creative_assets?.length>1)))return;
    const timer=setInterval(()=>setIndex(previous=>previous+1),6500);
    return()=>clearInterval(timer);
  },[hovered,focused,sponsors.length,sponsor?.creative_assets?.length]);
  const click=()=>{if(sponsor)recordSponsorClick(sponsor.id,'footer');};
  const creative = <>
      <div className="sponsor-carousel-media relative aspect-[16/9] bg-gray-100 lg:aspect-[4/3]"><picture>{sponsor?.mobile_image_url&&<source media="(max-width: 767px)" srcSet={sponsor.mobile_image_url} />}<img src={sponsor?.imagen_url||'https://images.unsplash.com/photo-1557838923-2985c318be48?w=640&q=75&auto=format&fit=crop'} alt={sponsor?.texto||'Publicidad en MiBatute'} loading="lazy" className="absolute inset-0 h-full w-full object-contain" /></picture></div>
      <div className="sponsor-carousel-copy px-4 pt-4 pb-3"><p className="text-[11px] font-semibold text-forest-green">{sponsor?.badge||'MiBatute'}</p><h4 className="mt-1 break-words text-lg font-black text-gray-800">{sponsor?.texto||'Anuncia tu marca en MiBatute'}</h4><p className="mt-1 break-words text-sm leading-5 text-gray-500">{sponsor?.descripcion||'Conoce nuestras opciones de publicidad.'}</p></div>
  </>;
  return <section ref={root} aria-label="Patrocinadores" aria-roledescription="carrusel" className="sponsor-carousel min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
    onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocusCapture={()=>setFocused(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))setFocused(false);}}>
    <div className="sponsor-carousel-heading flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3"><h3 className="text-xs font-black uppercase text-gray-800">Patrocinadores</h3><span className="text-[10px] text-gray-400">Publicidad</span></div>
    {sponsor?.enlace ? <a href={sponsor.enlace} target="_blank" rel="sponsored noopener noreferrer" onClick={click} aria-label={`Visitar patrocinador: ${sponsor.texto}`} className="block focus-visible:outline-2 focus-visible:outline-forest-green">{creative}</a>
      : <ContactButton subject="Publicidad en MiBatute" onClick={click} aria-label="Contactar a MiBatute para publicidad" className="block w-full text-left focus-visible:outline-2 focus-visible:outline-forest-green">{creative}</ContactButton>}
  </section>;
}
