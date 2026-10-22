import {CONTACT_EMAIL,REGISTRATION_ENABLED} from '../config/availability.js';
// Public contact only. Personal operator details must not be shipped to browsers.
export const LEGAL_VERSION='2026-10-19.2';
export const LEGAL_DATE='19 de octubre de 2026';
export const LEGAL_OPERATOR={email:CONTACT_EMAIL,emailVerified:false,identityOnRequest:true};
export const LEGAL_ATTENTION={lead:'Equipo de atención de MiBatute',backup:'equipo administrativo autorizado',backupEmail:'contacto@mibatute.com',frequency:'una vez cada día hábil',automaticRefunds:false,automaticErasure:false};
// Approved as an operational proposal, not yet legally validated or enabled for cleanup.
export const LEGAL_RETENTION_PROPOSAL={approvedByOperator:true,approvedOn:'2026-10-19',chatMaxDaysAfterCompletion:90,supportDaysAfterClosure:180,dataRequestMonthsAfterFinalResponse:24,cleanupEnabled:false};
export const LEGAL_APPROVED=false;
export const LEGAL_REVIEW={adultOnly:true,operatorIdentity:false,retention:false,processors:false,consumerRole:false,refundWorkflow:false,rightsWorkflow:false,professionalReview:false};
export const LEGAL_READY=LEGAL_APPROVED&&!LEGAL_OPERATOR.identityOnRequest&&Object.values(LEGAL_REVIEW).every(Boolean)&&LEGAL_OPERATOR.emailVerified&&['name','entityType','address','phone','email'].every(key=>!!LEGAL_OPERATOR[key]);
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
