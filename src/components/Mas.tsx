import { memo, useState } from 'react';
import { useEstado } from '../estado';
import { euros } from '../lib/formato';
import { totalMensual } from '../lib/recurrentes';
import Ajustes from './Ajustes';
import Categorias from './Categorias';
import Presupuesto from './Presupuesto';
import Hoja from './Hoja';
import Recurrentes from './Recurrentes';
import { CampoImporte, Icono, Seccion } from './ui';

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
  const [perfilAbierto, setPerfilAbierto] = useState(false);

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

      <button className="tarjeta perfil" onClick={() => setPerfilAbierto(true)}>
        <span className="perfil-avatar">{usuario?.nombre.charAt(0).toUpperCase()}</span>
        <div>
          <strong>{usuario?.nombre}</strong>
          <small className="importe">Ingresos habituales previstos: {euros(usuario?.ingresosNetosMensuales ?? 0)}/mes</small>
        </div>
        <Icono nombre="chevron" tam={18} />
      </button>

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

      <Hoja abierta={perfilAbierto} onCerrar={() => setPerfilAbierto(false)} titulo="Tu perfil" etiqueta="Tu perfil">
        <FormularioPerfil onCerrar={() => setPerfilAbierto(false)} />
      </Hoja>
    </div>
  );
}

function FormularioPerfil({ onCerrar }: { onCerrar(): void }) {
  const { usuario, actualizarUsuario, repetirOnboarding, notificar } = useEstado();
  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [ingresos, setIngresos] = useState(usuario?.ingresosNetosMensuales ?? 0);
  return (
    <div className="formulario formulario-hoja">
      <label className="campo">
        <span className="campo-etiqueta">Nombre</span>
        <input type="text" autoComplete="given-name" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>
      <CampoImporte id="perfil-ingresos" etiqueta="Ingresos habituales previstos al mes" valor={ingresos} onCambio={setIngresos} />
      <p className="hoja-resumen">Se usan mientras no apuntes la nómina del mes. Si cambian mucho, conviene repetir el diagnóstico para recalcular el plan.</p>
      <button
        className="boton-principal"
        disabled={!nombre.trim() || !(ingresos > 0)}
        onClick={async () => {
          await actualizarUsuario({ nombre: nombre.trim(), ingresosNetosMensuales: ingresos });
          notificar('Perfil actualizado');
          onCerrar();
        }}
      >
        Guardar
      </button>
      <div className="botonera botonera-centrada">
        <button
          className="boton-texto"
          onClick={() => {
            onCerrar();
            void repetirOnboarding();
          }}
        >
          Repetir diagnóstico
        </button>
      </div>
    </div>
  );
}
