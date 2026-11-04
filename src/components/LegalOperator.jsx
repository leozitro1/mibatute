import {LEGAL_OPERATOR} from '../legal/config.js';

export default function LegalOperator(){
 const entityLabel={natural:'Persona natural',juridica:'Persona jurídica'}[LEGAL_OPERATOR.entityType]||LEGAL_OPERATOR.entityType;
 const fields=[['Responsable',LEGAL_OPERATOR.name],['Tipo de titular',entityLabel],['NIT / RUT informado',LEGAL_OPERATOR.nit],['Dirección de notificación judicial',LEGAL_OPERATOR.address],['Teléfono',LEGAL_OPERATOR.phone],['Contacto oficial',LEGAL_OPERATOR.email],['Protección de datos',LEGAL_OPERATOR.dataEmail]];
 return <section className="legal-operator" aria-label="Identificación del responsable"><h2>Identificación del responsable de MiBatute</h2><dl>{fields.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'Sin definir — requerido antes del lanzamiento'}</dd></div>)}</dl></section>;
}
