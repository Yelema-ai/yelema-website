export async function boundedText(message: Pick<Request, "headers" | "body">, maxBytes: number): Promise<string | null> {
  const declared = Number(message.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await message.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!message.body) return "";
  const reader = message.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** The first `maxBytes` of a body as text, the rest left unread (the stream is cancelled); `cut` says so. Server or browser. */
export async function cappedText(message: Pick<Response, "body">, maxBytes: number): Promise<{ text: string; cut: boolean }> {
  if (!message.body) return { text: "", cut: false };
  const reader = message.body.getReader();
  // Streamed: a character cut in two at the limit stays in the decoder, never shown as « � ».
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = maxBytes - size;
    if (value.byteLength > room) {
      text += decoder.decode(value.subarray(0, room), { stream: true });
      await reader.cancel().catch(() => undefined);
      return { text, cut: true };
    }
    size += value.byteLength;
    text += decoder.decode(value, { stream: true });
  }
  return { text: text + decoder.decode(), cut: false };
}
