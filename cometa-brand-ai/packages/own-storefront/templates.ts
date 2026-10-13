import { emptyAppearance, type Appearance } from './contract';
import { upgradeAppearance } from './config-version';
/** Design presets contain no commercial products, claims or demonstration photographs. */
export const templates = {atelier:{id:'atelier',version:1,name:'Atelier editorial',pages:['home','catalog','product','bag'] as const}};
export function createTemplate(name: string): Appearance { return upgradeAppearance({...emptyAppearance(),name,navigation:[{title:'Inicio',url:'/'},{title:'Catálogo',url:'/catalogo'}],headerDesign:{identity:'text',centered:true,logoWidth:170,mobileLogoWidth:145,showAnnouncement:true,showNavigation:true}}); }
export function resetTemplateDesign(document: Appearance): Appearance {
 const defaults=createTemplate(document.name);
 return {...document,paper:defaults.paper,ink:defaults.ink,accent:defaults.accent,soft:defaults.soft,font:defaults.font,spacing:defaults.spacing,design:{},sections:document.sections.map(s=>({...s,design:undefined})),headerDesign:defaults.headerDesign};
}
