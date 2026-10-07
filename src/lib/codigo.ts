/**
 * Código de bloqueo. Solo se guarda SHA-256(sal + código), nunca el código.
 *
 * Es una barrera de privacidad (que nadie cotillee tus cuentas si coge el móvil), no cifrado:
 * los datos siguen en IndexedDB sin cifrar y un código de 4 cifras se puede probar por fuerza bruta
 * con acceso al almacenamiento del navegador.
 */
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

export const nuevaSal = () => hex(crypto.getRandomValues(new Uint8Array(16)));

export async function hashCodigo(codigo: string, sal: string): Promise<string> {
  const datos = new TextEncoder().encode(`${sal}:${codigo}`);
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', datos)));
}

export const LONGITUD_CODIGO = 4;
