import "server-only";

const maxBodyBytes = 32 * 1024;

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function invalidBody() {
  return new HttpError(422, "VALIDATION_ERROR", "Isi permintaan tidak valid.");
}

function oversizedBody() {
  return new HttpError(413, "BODY_TOO_LARGE", "Ukuran permintaan melebihi 32 KiB.");
}

function unsupportedMediaType() {
  return new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Gunakan Content-Type application/json.");
}

export async function readJsonBody(request: Request, allowEmpty = false): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBodyBytes) throw oversizedBody();
  if (!request.body && allowEmpty) return {};

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  const isJson = contentType === "application/json";
  if (!isJson && !allowEmpty) throw unsupportedMediaType();
  if (!request.body) throw invalidBody();

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let received = 0;
  let body = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > maxBodyBytes) throw oversizedBody();
      if (isJson) body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    if (error instanceof HttpError) throw error;
    throw invalidBody();
  } finally {
    reader.releaseLock();
  }

  if (received === 0 && allowEmpty) return {};
  if (!isJson) throw unsupportedMediaType();
  try {
    return JSON.parse(body);
  } catch {
    throw invalidBody();
  }
}
