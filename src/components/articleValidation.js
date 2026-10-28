export const PUBLICATION_CONTACT_NOTICE='No publiques teléfonos, correos, usuarios ni enlaces de redes sociales en el título, la descripción o las fotos. Usa el chat interno de MiBatute. Incumplir esta norma puede generar sanciones, previa revisión del equipo.';
const CONTACT_ERROR='No publiques datos de contacto, correos ni redes sociales. Corrige el título o la descripción y usa el chat interno de MiBatute.';
const RULE_ERROR='El texto contiene una palabra o frase no permitida. Corrígelo antes de publicar; si crees que es un error, contacta al equipo desde tu buzón.';
const NUMBER_WORDS={cero:'0',uno:'1',dos:'2',tres:'3',cuatro:'4',cinco:'5',seis:'6',siete:'7',ocho:'8',nueve:'9'};

export function normalizePublicationText(value=''){
 return String(value).normalize('NFKC').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\ufe0f\u20e3]/g,'')
  .replace(/[аесорхуіјѕοα]/g,char=>({'а':'a','е':'e','с':'c','о':'o','р':'p','х':'x','у':'y','і':'i','ј':'j','ѕ':'s','ο':'o','α':'a'})[char]);
}
export function publicationWordKey(value=''){
 return normalizePublicationText(value).replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function matchingWords(value){
 const compact=normalizePublicationText(value).replace(/\b(?:[a-z0-9][. _-]+){2,}[a-z0-9]\b/g,part=>part.replace(/[. _-]/g,''));
 return publicationWordKey(compact.replace(/[431057!@$]/g,char=>({'4':'a','3':'e','1':'i','0':'o','5':'s','7':'t','!':'i','@':'a','$':'s'})[char]));
}
function hasContact(value){
 const folded=normalizePublicationText(value);
 const text=folded.replace(/\b(?:[a-z][. _-]+){2,}[a-z]\b/g,part=>part.replace(/[. _-]/g,''));
 const address=text.replace(/[()[\]]/g,' ').replace(/\b(?:arroba|at)\b/g,'@').replace(/\b(?:punto|dot)\b/g,'.').replace(/\s*([@.])\s*/g,'$1');
 if(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}\b/.test(address)
  ||/\b(?:https?:\/\/|www\.)\S+/i.test(address)
  ||/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|co|net|org|io|me|link|app|xyz|site|online|es|info|ly)(?:\b|\/)/.test(address)
  ||/(?:^|[\s(])@[a-z0-9_][a-z0-9_.]{1,29}\b/.test(text)
  ||/\b(?:whatsapp|whats app|wasap|wsp|wpp|instagram|facebook|tiktok|telegram|twitter|discord|linkedin|ig|fb)\s*[:@/]\s*[a-z0-9]/.test(text)
  ||/\b(?:mi|buscame en|sigueme en|contactame por|escribeme por)\s+(?:whatsapp|instagram|facebook|tiktok|telegram|twitter|ig|fb)\b/.test(text))return true;
 const numeric=text.replace(/\b(cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/g,word=>NUMBER_WORDS[word]);
 for(const candidate of numeric.matchAll(/(?<![a-z0-9])\+?\d(?:[\s().-]*\d){6,14}(?![a-z0-9])/g)){
  const digits=candidate[0].replace(/\D/g,'');
  if(/^(?:57)?3\d{9}$/.test(digits)||candidate[0].startsWith('+')&&digits.length>=8
   ||/\b(?:tel|telefono|cel|celular|llamame|llamar|whatsapp|wsp|contacto)\b/.test(numeric.slice(Math.max(0,candidate.index-45),candidate.index)))return true;
 }
 return false;
}
export function publicationTextIssue(value='',rules=[]){
 if(String(value).length>4000)return 'Usa un texto de máximo 4.000 caracteres.';
 if(hasContact(value))return CONTACT_ERROR;
 const words=` ${matchingWords(value)} `;
 if(rules.some(term=>{const key=matchingWords(term);return key&&words.includes(` ${key} `);} ))return RULE_ERROR;
 return null;
}
// Kept as a small shared compatibility wrapper for create/edit and wizard validation.
export function detectContactoProhibido(value=''){return publicationTextIssue(value);}
export function validatePublicationText(title,description,rules=[]){
 if(String(title||'').length>160)return 'El título debe tener máximo 160 caracteres.';
 return publicationTextIssue(title,rules)||publicationTextIssue(description,rules);
}
