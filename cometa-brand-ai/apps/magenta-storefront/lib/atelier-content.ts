import {mediaUrl,type Appearance} from '../../../packages/own-storefront/contract';

// Layout is independent of deployment target. Demonstration content is not.
export function atelierContent(appearance:Appearance,mediaBase:string,slug:string,env:Record<string,string|undefined>=process.env){
 const demo=env.VERCEL_ENV==='preview'&&(env.STOREFRONT_PAYMENTS_MODE??'test')==='test';
 const section=(kind:string)=>appearance.sections.find(s=>s.kind===kind&&s.enabled);
 const image=(path:string|undefined)=>path?.startsWith(slug+'/web/')&&!/(demo|synthetic|sintetico)/i.test(path)?mediaUrl(mediaBase,path):undefined;
 const hero=section('hero'),look=section('look');
 return {demo,hero,look,heroImage:demo?'/atelier/hero-demo.jpg':image(hero?.image),lookImage:demo?'/atelier/look-demo-v4.png':image(look?.image),categories:section('categories')?.entries.map(e=>({...e,image:image(e.image)})).filter(e=>e.image)??[],marquee:section('marquee')?.text??'',logo:image(appearance.logo)??'/atelier/magenta-logo.png',image};
}
