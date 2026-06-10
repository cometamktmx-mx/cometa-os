export default function Sidebar() {
  const items = [
    { name: "Dashboard", icon: "◼" },
    { name: "Nuevo análisis", icon: "✦" },
    { name: "Historial", icon: "◎" },
    { name: "Estrategias", icon: "▣" },
    { name: "Exportar PDF", icon: "↗" },
    { name: "Configuración", icon: "⚙" },
  ];

  return (
    <aside className="fixed left-0 top-0 h-screen w-72 bg-white border-r border-slate-200 p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-10">
        <img
          src="/logo.png"
          alt="Cometa Logo"
          className="w-12 h-12 object-contain"
        />

        <div>
          <p className="font-bold text-slate-900 leading-none">
            COMETA
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Brand AI
          </p>
        </div>
      </div>

      <nav className="space-y-2">
        {items.map((item) => (
          <button
            key={item.name}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-all duration-300 text-left"
          >
            <span className="text-lg">
              {item.icon}
            </span>

            <span className="font-medium">
              {item.name}
            </span>
          </button>
        ))}
      </nav>

      <div className="absolute bottom-6 left-6 right-6 bg-slate-50 border border-slate-200 rounded-3xl p-4">
        <p className="text-sm font-semibold text-slate-900">
          Cometa IA System
        </p>

        <p className="text-xs text-slate-500 mt-1 leading-5">
          Plataforma interna de inteligencia estratégica.
        </p>
      </div>
    </aside>
  );
}