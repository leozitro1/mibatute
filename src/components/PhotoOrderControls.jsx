import { ChevronLeft,ChevronRight } from 'lucide-react';
import './PhotoOrderControls.css';
export default function PhotoOrderControls({index,count,onMove,disabled=false}) {
 return <div className="photo-order-controls"><span>{index===0?'Portada':`Foto ${index+1}`}</span><div>
  <button type="button" aria-label={`Mover foto ${index+1} antes`} title="Mover antes" disabled={disabled||index===0} onClick={()=>onMove(index,index-1)}><ChevronLeft size={17} aria-hidden="true"/></button>
  <button type="button" aria-label={`Mover foto ${index+1} después`} title="Mover después" disabled={disabled||index===count-1} onClick={()=>onMove(index,index+1)}><ChevronRight size={17} aria-hidden="true"/></button>
 </div></div>;
}
