import {ArrowLeft,MapPin,Star} from 'lucide-react';
import ProfileAvatar from './ProfileAvatar.jsx';
import UserTrustBadges from './UserTrustBadges.jsx';
import './SellerCatalogHeader.css';

export default function SellerCatalogHeader({seller,user,total,busy,onBack}) {
 const reputation=seller.reputation;
 const rated=Number(reputation?.total)>0;
 const location=[seller.city,seller.locality].filter(Boolean).join(', ');
 return <section className="seller-catalog-header" aria-labelledby="seller-catalog-name">
  <div className="seller-catalog-avatar"><ProfileAvatar user={user} photo={seller.photo} name={seller.nombre}/></div>
  <div className="seller-catalog-identity">
   <h1 id="seller-catalog-name"><span>Publicaciones de:</span>{seller.nombre}</h1>
   <UserTrustBadges verified={seller.verified} sellerRegistered={seller.sellerRegistered}/>
   <div className="seller-catalog-meta">
    <span className="seller-catalog-rating" aria-label={rated?`Calificación ${reputation.promedio} de 5, ${reputation.total} valoraciones`:'Sin valoraciones todavía'}>
     <span aria-hidden="true">{[1,2,3,4,5].map(value=><Star key={value} size={14} fill={rated&&value<=Math.round(reputation.promedio)?'currentColor':'none'}/>)}</span>
     <small>{rated?`${Number(reputation.promedio).toFixed(1)} (${reputation.total})`:'Sin valoraciones'}</small>
    </span>
    {location&&<span className="seller-catalog-location"><MapPin size={14} aria-hidden="true"/>{location}</span>}
   </div>
  </div>
  <div className="seller-catalog-actions">
   <button type="button" onClick={onBack}><ArrowLeft size={16} aria-hidden="true"/>Volver</button>
   {!busy&&<span>{total} {total===1?'publicación':'publicaciones'}</span>}
  </div>
 </section>;
}
