// 공유 링크용 입력 인코딩: JSON → UTF-8 → base64url
export function encodeInputs(inputs: string[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(inputs));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeInputs(s: string): string[] | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const arr = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(arr) || arr.length > 10 || !arr.every((x) => typeof x === 'string' && x.length <= 200)) return null;
    return arr;
  } catch { return null; }
}
