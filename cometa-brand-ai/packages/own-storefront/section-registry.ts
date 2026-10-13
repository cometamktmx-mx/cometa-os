import type { Section, SectionKind } from './contract';
export type SectionDefinition = { label: string; pages: readonly ['home']; duplicable: boolean; renderer: SectionKind; controls: readonly ('image'|'title'|'description'|'button'|'products')[]; entries: 'none'|'products'|'cards'|'text'|'video' };
const definition = (label: string, renderer: SectionKind, controls: SectionDefinition['controls'], entries: SectionDefinition['entries']='none'): SectionDefinition => ({label,renderer,controls,entries,pages:['home'],duplicable:true});
export const sectionRegistry: Record<SectionKind,SectionDefinition> = {
 hero:definition('Portada','hero',['image','title','description','button']),
 marquee:definition('Franja animada','marquee',['description']),
 categories:definition('Categorías','categories',['title','description'],'cards'),
 featured:definition('Productos destacados','featured',['title','description','products'],'products'),
 look:definition('Compra el look','look',['image','title','description','products'],'products'),
 videos:definition('Videos','videos',['title','description'],'video'),
 testimonials:definition('Testimonios','testimonials',['title','description'],'cards'),
 benefits:definition('Beneficios','benefits',['title','description'],'text'),
 wholesale:definition('Mayoreo','wholesale',['image','title','description','button']),
 faq:definition('Preguntas frecuentes','faq',['title','description'],'text'),
 newsletter:definition('Newsletter','newsletter',['title','description','button'])
};
export const sectionId = (section: Section) => section.id ?? section.kind;
export const createSection = (kind: SectionKind, id: string): Section => ({id,kind,enabled:true,title:'',text:'',image:'',url:'',entries:[]});
