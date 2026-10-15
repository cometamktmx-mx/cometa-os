"use client";
import { defaultCatalog, catalogFilters, type CatalogConfig } from "../../../../../../../packages/own-storefront/catalog-contract";
export function CatalogSettings({ value, onChange, image }: { value?: CatalogConfig; onChange:(v:CatalogConfig)=>void; image:(path:string,onChange:(v:string)=>void)=>React.ReactNode }) {
  const c = value ?? defaultCatalog(), set = (patch:Partial<CatalogConfig>) => onChange({...c,...patch});
  return <details open><summary>Catálogo público</summary><p>Comparte borrador, publicación y revisión con Apariencia. No modifica las secciones de la home.</p>
    <label>Título<input value={c.title} maxLength={150} onChange={e=>set({title:e.target.value})} /></label><label>Descripción<textarea value={c.description} maxLength={2000} onChange={e=>set({description:e.target.value})} /></label>
    {image(c.banner,banner=>set({banner}))}
    <label>Columnas en escritorio<select value={c.columns} onChange={e=>set({columns:Number(e.target.value)})}>{[2,3,4,5].map(n=><option key={n}>{n}</option>)}</select></label>
    <label>Proporción de fotografías<select value={c.ratio} onChange={e=>set({ratio:e.target.value as CatalogConfig["ratio"]})}><option value="portrait">Vertical 3:4</option><option value="square">Cuadrada 1:1</option><option value="tall">Vertical 2:3</option></select></label>
    <label className="appearance-check"><input type="checkbox" checked={c.secondImage} onChange={e=>set({secondImage:e.target.checked})}/>Segunda imagen del mismo color al pasar el puntero</label><label className="appearance-check"><input type="checkbox" checked={c.swatches} onChange={e=>set({swatches:e.target.checked})}/>Mostrar círculos de color</label>
    <fieldset><legend>Filtros visibles</legend>{catalogFilters.map((f,i)=><label className="appearance-check" key={f}><input type="checkbox" checked={c.filters.includes(f)} onChange={e=>set({filters:e.target.checked?[...c.filters,f]:c.filters.filter(v=>v!==f)})}/>{["Categoría","Color","Talla","Precio","Disponibilidad"][i]}</label>)}</fieldset>
    <label>Orden predeterminado<select value={c.sort} onChange={e=>set({sort:e.target.value as CatalogConfig["sort"]})}><option value="newest">Novedades</option><option value="price_asc">Precio ascendente</option><option value="price_desc">Precio descendente</option><option value="name">Nombre</option></select></label>
    <label>Productos por página<select value={c.perPage} onChange={e=>set({perPage:Number(e.target.value)})}>{[8,12,16,24,32,48].map(n=><option key={n}>{n}</option>)}</select></label><p>Agrega /catalogo a la navegación cuando quieras mostrar la entrada pública. Las fotografías y variantes se administran en la ficha de cada producto.</p>
  </details>;
}
