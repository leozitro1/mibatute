// One deadline shared by the request's outbound calls; no retries or extra traffic.
export function createBudgetFetch({ timeoutMs = 15000, signal = AbortSignal.timeout(timeoutMs), fetcher = (...args) => globalThis.fetch(...args) } = {}) {
  return (input, init = {}) => {
    signal.throwIfAborted();
    const existing = init.signal || input?.signal;
    return fetcher(input, { ...init, signal: existing ? AbortSignal.any([signal, existing]) : signal });
  };
}
