import {chatRetentionNotice} from './chatRetention.js';
export default function ChatRetentionNotice({status,now,compact=false}) {
 const notice=chatRetentionNotice(status||{},now);
 if(!notice)return null;
 return compact?<small className="chat-retention-countdown" title={notice.detail}>{notice.text}</small>
 :<div className="mx-4 mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600"><strong>{notice.text}</strong><p className="mt-1 leading-5">{notice.detail}</p></div>;
}
