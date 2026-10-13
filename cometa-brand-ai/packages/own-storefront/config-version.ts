import type { Appearance, Section } from './contract';
import { sectionId } from './section-registry';
/** Pure adaptation: never writes or changes the currently published document. */
export function upgradeAppearance(document: Appearance): Appearance {
 return {...document,schemaVersion:2,template:document.template??{id:'atelier',version:1},sections:document.sections.map(s=>({...s,id:sectionId(s)}))};
}
export function duplicateSection(document: Appearance, sourceId: string, newId: string): Appearance {
 const next=upgradeAppearance(document),index=next.sections.findIndex(s=>sectionId(s)===sourceId);
 if(index<0 || next.sections.length>=40 || !/^s-[a-z0-9-]{1,60}$/.test(newId) || next.sections.some(s=>sectionId(s)===newId)) throw Error('APPEARANCE_INVALID');
 const source=next.sections[index];
 const copy:Section=JSON.parse(JSON.stringify({...source,id:newId,design:source.design??next.design?.[source.kind],buttonLabel:source.buttonLabel??next.buttonLabels?.[source.kind],mediaLayout:source.mediaLayout??next.mediaLayout}));
 return {...next,sections:[...next.sections.slice(0,index+1),copy,...next.sections.slice(index+1)]};
}
