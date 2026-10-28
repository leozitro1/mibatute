export function creditBalanceIncreased(previous,next){
 return Number.isFinite(previous)&&Number.isFinite(next)&&next>previous;
}
