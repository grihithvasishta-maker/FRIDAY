/**
 * FRIDAY Cryptographic Module
 * Implements AES-256-GCM for client-side data obfuscation.
 */

export async function encryptKey(text: string, secret: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret.padEnd(32, '0').slice(0, 32)),
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  const encryptedArray = new Uint8Array(encrypted);
  const combined = new Uint8Array(iv.length + encryptedArray.length);
  combined.set(iv);
  combined.set(encryptedArray, iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

export async function decryptKey(encoded: string, secret: string) {
  const encoder = new TextEncoder();
  const combined = new Uint8Array(atob(encoded).split("").map(c => c.charCodeAt(0)));
  
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret.padEnd(32, '0').slice(0, 32)),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  return new TextDecoder().decode(decrypted);
}
