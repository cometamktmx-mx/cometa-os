# Atelier 0.6: diferencias antes de intervenir el diseño

Referencia vinculante: `referencias-magenta/MAGENTA-Atelier-Shopify-v0.6.zip`. La Preview funcional actual **no tiene aprobación visual**. No se alteró el diseño en esta continuación. Se esperan indicaciones del usuario por pantalla.

Comparación de código, configuración y recursos; no de píxeles renderizados. El navegador no está disponible y no se eludió el bloqueo. Un HTTP 200 o un hero presente no acredita fidelidad, comportamiento móvil ni movimiento correcto.

| Pantalla/bloque | Referencia ZIP | Implementación/configuración actual | Diferencia pendiente |
|---|---|---|---|
| Navegación | `sections/header.liquid`: header configurable, menú móvil, submenús, búsqueda, favoritos, cuenta, bolsa con contador | Enlaces simples Inicio/Colección, Bolsa/Mis pedidos, logo centrado | Estructura, controles, densidad, navegación móvil y sus estados no equivalen |
| Home: hero | `sections/hero.liquid`: kicker THE MAGENTA EDIT, título con `em`, CTA secundario, nota e índice; imagen móvil/video y parámetros de foco; configuración 660 de alto/104 de título | Título de texto en dos líneas, sin la semántica/cursiva de referencia ni todos los elementos secundarios | Composición, jerarquía, recorte y espacios necesitan instrucciones por pantalla y comprobación visual |
| Home: categorías | Cuatro editoriales: Leggings, Tops, Conjuntos, Esenciales | Dos tarjetas demo | Cantidad, proporciones y ritmo editorial distintos |
| Home: favoritos/look | Cuatro productos y composición editorial del ZIP | Un producto sintético sin fotografía; look editorial demo | No hay contenido real equivalente. No asignar fotografía demo al SKU sintético |
| Home: secciones | Hero → marquee → categorías → favoritos → look → videos (3) → reseñas → beneficios (4) → mayoreo → FAQ (3) → newsletter; colores/actividades deshabilitados | Videos/reseñas/beneficios/mayoreo/newsletter deshabilitados; FAQ con contenido de pruebas | Página incompleta respecto al orden y contenido aprobados |
| Movimiento | `assets/atelier-v4.js`: IntersectionObserver/reveal, reduced motion, teclado, Escape del menú y limpieza de listeners | Marquee y animación de entrada limitada; entrada desactivada en configuración | No se ha trasladado el sistema de interacción y aparición del ZIP |
| Catálogo, producto, bolsa | Plantillas y controles Shopify del ZIP son la referencia visual | Catálogo, variantes y checkout conectados a motor propio | Funcionamiento HTTP verificado; galería, tamaños, espacios, foco, bolsa y móvil no certificados visualmente |
| Footer | Composición y columnas de la referencia | Duplicado eliminado en continuación anterior | Tener un solo footer no acredita que composición/espacios sean fieles |

La anterior afirmación del informe de que se había publicado la composición aprobada debe entenderse como una adaptación parcial: **no equivale a aceptación de Atelier**. La Preview visual histórica tampoco sustituye la comparación con el ZIP.

Próxima intervención visual: recibir indicaciones por pantalla, fijar componentes y recursos exactos, adaptar sin sustituir el motor comercial, comparar escritorio/móvil, estados de bolsa/variantes y movimiento reducido. No abrir ventas hasta aprobación explícita. No se propone otro rediseño.
