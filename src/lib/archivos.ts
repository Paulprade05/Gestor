/** En iPhone abre la hoja de compartir (Guardar en Archivos, AirDrop, Mail…); si no, descarga. */
export async function compartirArchivo(nombre: string, contenido: string, tipo: string): Promise<void> {
  const archivo = new File([contenido], nombre, { type: tipo });
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombre });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(archivo);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
