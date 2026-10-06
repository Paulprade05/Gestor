/**
 * Ajustes de comportamiento para Safari en iPhone.
 *
 * Teclado: en iOS el teclado no reduce la ventana, sino el «visual viewport». Los elementos fijados
 * abajo (las hojas) se quedarían detrás del teclado, así que se publica su altura en `--teclado`
 * y la clase `con-teclado` en <html>; el CSS sube las hojas por encima y oculta la tab bar.
 * Además, el campo enfocado dentro de una hoja se desplaza al centro de lo visible.
 */
export function iniciarAjustesIOS(): void {
  const raiz = document.documentElement;
  const vv = window.visualViewport;

  if (vv) {
    let pendiente = 0;
    const ajustar = () => {
      cancelAnimationFrame(pendiente);
      pendiente = requestAnimationFrame(() => {
        const teclado = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        raiz.style.setProperty('--teclado', `${teclado}px`);
        raiz.classList.toggle('con-teclado', teclado > 80);
        // El teclado cambia de altura (sugerencias, emojis…): mantener visible el campo enfocado.
        const activo = document.activeElement as HTMLElement | null;
        if (teclado > 80 && activo?.matches('input, select, textarea') && activo.closest('.hoja')) activo.scrollIntoView({ block: 'center' });
      });
    };
    vv.addEventListener('resize', ajustar);
    vv.addEventListener('scroll', ajustar);
    ajustar();
  }

  document.addEventListener('focusin', (e) => {
    const campo = e.target as HTMLElement;
    if (!campo.matches('input, select, textarea') || !campo.closest('.hoja')) return;
    // Se espera a que el teclado termine de subir (≈ 300 ms en iOS).
    setTimeout(() => campo.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
  });

  // Sin un listener de touchstart, Safari en iOS no aplica los estilos :active al tocar.
  document.addEventListener('touchstart', () => undefined, { passive: true });
}
