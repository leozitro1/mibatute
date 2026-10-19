export const SUPPORT_NOTICE_EVENT='mb:support-updated';
export function dispatchSupportNotice(threadId=null,removed=false) {
  if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent(SUPPORT_NOTICE_EVENT,{detail:{threadId,removed}}));
}
