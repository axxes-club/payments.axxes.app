/** Bound bytes and total read time before parsing or verifying an untrusted body. */
export class BodyRefusal extends Error {
  constructor(public readonly status: number) { super('Request body refused'); }
}
export async function readBody(request: Request, maxBytes = 16384, timeoutMs = 5000): Promise<string> {
  const length = request.headers.get('content-length');
  if (length && /^\d+$/.test(length) && Number(length) > maxBytes) throw new BodyRefusal(413);
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new BodyRefusal(408)), timeoutMs); });
  let bytes = 0; let result = '';
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) return result + decoder.decode();
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new BodyRefusal(413);
      result += decoder.decode(value, { stream: true });
    }
  } finally {
    clearTimeout(timer);
    // Cancellation can itself stall; never let it extend the admission deadline.
    void reader.cancel().catch(() => {});
  }
}
