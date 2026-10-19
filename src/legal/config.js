import {CONTACT_EMAIL,REGISTRATION_ENABLED} from '../config/availability.js';
// Complete and approve these fields before enabling public registration or payments.
export const LEGAL_VERSION='2026-10-19.2';
export const LEGAL_DATE='19 de octubre de 2026';
export const LEGAL_OPERATOR={name:'Leonardo Ortiz Diaz',entityType:'Persona natural',taxId:'79571562-4',address:'Transversal 96B 20D 70, Bogotá, Colombia',phone:'7515727978',email:CONTACT_EMAIL,emailVerified:false};
export const LEGAL_ATTENTION={lead:'responsable',backup:'Edgar Diaz',backupEmail:'contacto@mibatute.com',frequency:'una vez cada día hábil',automaticRefunds:false,automaticErasure:false};
// Approved as an operational proposal, not yet legally validated or enabled for cleanup.
export const LEGAL_RETENTION_PROPOSAL={approvedByOperator:true,approvedOn:'2026-10-19',chatMaxDaysAfterCompletion:90,supportDaysAfterClosure:180,dataRequestMonthsAfterFinalResponse:24,cleanupEnabled:false};
export const LEGAL_APPROVED=false;
export const LEGAL_REVIEW={adultOnly:true,retention:false,processors:false,consumerRole:false,refundWorkflow:false,rightsWorkflow:false,professionalReview:false};
export const LEGAL_READY=LEGAL_APPROVED&&Object.values(LEGAL_REVIEW).every(Boolean)&&LEGAL_OPERATOR.emailVerified&&['name','entityType','address','phone','email'].every(key=>!!LEGAL_OPERATOR[key]);
export const LEGAL_LINKS=[['/terminos','Términos'],['/privacidad','Privacidad'],['/pagos','Pagos y devoluciones'],['/cookies','Cookies y preferencias'],['/datos-personales','Solicitudes de datos'],['/normas','Normas de la comunidad']];
export function legalAcceptance(terms,privacy,adult){
  if(!LEGAL_READY||!terms||!privacy||!adult)return null;
  return {terms_version:LEGAL_VERSION,privacy_version:LEGAL_VERSION,adult_confirmed:true};
}

// Testing acknowledgement is recorded separately from an approved release.
export function registrationAcceptance(terms,privacy,adult){
 if(!REGISTRATION_ENABLED||!terms||!privacy||!adult)return null;
 if(LEGAL_READY)return legalAcceptance(terms,privacy,adult);
 return {terms_version:LEGAL_VERSION,privacy_version:LEGAL_VERSION,adult_confirmed:true,review_status:'draft'};
}
