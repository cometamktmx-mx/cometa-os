export function AccountIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    Resumen: "M3 10 12 3l9 7v10H3ZM9 20v-7h6v7",
    "Mis pedidos": "M4 7h16v14H4ZM8 7V5a4 4 0 0 1 8 0v2",
    Direcciones: "M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0ZM14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
    Favoritos: "M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-4 4 1 9 8 15 7-6 12-11 8-15Z",
    "Mis datos": "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2",
    "Puntos y recompensas": "m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z",
    Salir: "M9 3H4v18h5M9 12h12m-5-5 5 5-5 5",
    Flecha: "m9 5 7 7-7 7",
    Categorías: "M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z",
  };
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] || paths.Resumen} /></svg>;
}
