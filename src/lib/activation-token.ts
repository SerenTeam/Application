// Hash du jeton d'activation côté navigateur (contrat §6) : sha256 des octets UTF-8 de la chaîne
// base64url, en hexadécimal minuscule — strictement identique à hashInviteToken (Node).
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
