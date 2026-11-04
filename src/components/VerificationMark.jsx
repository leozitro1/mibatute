import { BadgeCheck } from 'lucide-react';
import './AccountVerification.css';

export default function VerificationMark({verified,compact=false}) {
 if(verified!==true)return null;
 return <span className={`verification-public-badge${compact?' verification-public-badge--gold':''}`} title="Cuenta verificada mediante revisión manual por MiBatute" aria-label="Cuenta verificada mediante revisión manual por MiBatute"><BadgeCheck size={compact?20:15} strokeWidth={compact?2.5:2} aria-hidden="true"/>{!compact&&'Cuenta verificada'}</span>;
}
