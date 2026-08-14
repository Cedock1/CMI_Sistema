export default function Home() {
  return (
    <div className="home">
      <h1>Cuadro de Mando Integral</h1>
      <p className="muted">Compromisos y planificación del Despacho — Plan Ciudad Humana, GAMLP.</p>
      <div className="cards">
        <a className="hcard" href="/tablero">
          <div className="ic">🏛️</div>
          <h3>Tablero</h3>
          <p>Ver todo por eje, programa, proyecto, tarea y subtarea, con semáforo y mapa por macrodistrito.</p>
        </a>
        <a className="hcard" href="/generar">
          <div className="ic">✨</div>
          <h3>Generar tareas con IA</h3>
          <p>Elegí un proyecto → la IA propone tareas, subtareas y valoración RICE → confirmás.</p>
        </a>
      </div>
    </div>
  );
}
