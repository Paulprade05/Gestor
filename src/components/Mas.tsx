import { memo, useState } from 'react';
import { useEstado } from '../estado';
import { euros } from '../lib/formato';
import { totalMensual } from '../lib/recurrentes';
import Ajustes from './Ajustes';
import Categorias from './Categorias';
import Presupuesto from './Presupuesto';
import Recurrentes from './Recurrentes';
import { Icono, Seccion } from './ui';

type Sub = 'presupuesto' | 'recurrentes' | 'categorias' | 'ajustes';

const TITULOS: Record<Sub, string> = {
  presupuesto: 'Presupuesto',
  recurrentes: 'Movimientos fijos',
  categorias: 'Categorías',
  ajustes: 'Ajustes y datos',
};

export default memo(Mas);

function Mas() {
  const { usuario, limites, recurrentes, categorias } = useEstado();
  const [sub, setSub] = useState<Sub | null>(null);

  if (sub) {
    return (
      <div className="subpantalla">
        <header className="cabecera-sub">
          <button className="boton-texto boton-volver" onClick={() => setSub(null)}>
            <Icono nombre="atras" tam={20} /> Más
          </button>
          <h1>{TITULOS[sub]}</h1>
        </header>
        {sub === 'presupuesto' && <Presupuesto />}
        {sub === 'recurrentes' && <Recurrentes />}
        {sub === 'categorias' && <Categorias />}
        {sub === 'ajustes' && <Ajustes />}
      </div>
    );
  }

  const activos = recurrentes.filter((r) => r.activo).length;
  const opciones: { id: Sub; emoji: string; detalle: string }[] = [
    { id: 'presupuesto', emoji: '📐', detalle: `${limites.length} categorías con límite · diagnóstico` },
    {
      id: 'recurrentes',
      emoji: '🔁',
      detalle: activos ? `${activos} ${activos === 1 ? 'activo' : 'activos'} · −${euros(totalMensual(recurrentes, 'gasto'))} / +${euros(totalMensual(recurrentes, 'ingreso'))} al mes` : 'Nómina, alquiler, suscripciones…',
    },
    {
      id: 'categorias',
      emoji: '🏷️',
      detalle: `${categorias.personalizadas.length} tuyas${categorias.ocultas.length ? ` · ${categorias.ocultas.length} ocultas` : ''}`,
    },
    { id: 'ajustes', emoji: '⚙️', detalle: 'Exportar a Excel, copia de seguridad, sincronizar' },
  ];

  return (
    <div className="pantalla">
      <header className="cabecera-grande">
        <h1>Más</h1>
      </header>

      <div className="tarjeta perfil">
        <span className="perfil-avatar">{usuario?.nombre.charAt(0).toUpperCase()}</span>
        <div>
          <strong>{usuario?.nombre}</strong>
          <small>Ingresos habituales previstos: {euros(usuario?.ingresosNetosMensuales ?? 0)}/mes</small>
        </div>
      </div>

      <Seccion>
        {opciones.map((o) => (
          <button key={o.id} className="fila fila-boton" onClick={() => setSub(o.id)}>
            <span className="fila-icono">{o.emoji}</span>
            <span className="fila-texto">
              {TITULOS[o.id]}
              <small>{o.detalle}</small>
            </span>
            <Icono nombre="chevron" tam={18} />
          </button>
        ))}
      </Seccion>
    </div>
  );
}
