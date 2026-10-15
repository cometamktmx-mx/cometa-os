"use client";
import Link from 'next/link';
import {AtelierLogo} from './atelier-logo';
import {useEffect,useRef,useState} from 'react';
import {readBag,editBag} from '../../../packages/own-storefront/bag';
import {money,type CartQuote} from '../../../packages/own-storefront/checkout-contract';

export function AtelierIcon({name}:{name:'search'|'bag'|'user'|'menu'|'close'|'card'}){
 return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">{name==='search'?<><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></>:name==='user'?<><circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/></>:name==='menu'?<path d="M3 6h18M3 12h18M3 18h18"/>:name==='close'?<path d="m5 5 14 14M5 19 14 5"/>:name==='card'?<><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20m-16 5h5"/></>:<><path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></>}</svg>;
}
export function AtelierHeader({brandId,name,logo}:{brandId:string;name:string;logo:string}){
 const [menu,setMenu]=useState(false),[count,setCount]=useState(0),[quote,setQuote]=useState<CartQuote|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const search=useRef<HTMLDialogElement>(null),bag=useRef<HTMLDialogElement>(null),revision=useRef(0),lock=useRef(false);
 const query=async()=>{const version=++revision.current;setBusy(true);setError('');try{
  const lines=readBag(brandId);setCount(lines.reduce((n,l)=>n+l.quantity,0));if(!lines.length){setQuote(null);return;}
  const r=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'quote',lines}),cache:'no-store'}),d=await r.json();if(!r.ok||d.brandId!==brandId)throw Error('No se pudo consultar tu bolsa. Intenta de nuevo.');if(version===revision.current)setQuote(d);
 }catch(e){if(version===revision.current){setQuote(null);setError(e instanceof Error?e.message:'No disponible.');}}finally{if(version===revision.current)setBusy(false);}};
 const openBag=()=>{bag.current?.showModal();void query();};
 const change=async(id:string,quantity:number)=>{if(lock.current)return;lock.current=true;setBusy(true);try{await editBag(brandId,id,quantity);await query();}catch{setError('No se pudo cambiar la cantidad.');}finally{lock.current=false;setBusy(false);}};
 useEffect(()=>{
  const sync=()=>setCount(readBag(brandId).reduce((n,l)=>n+l.quantity,0));sync();
  const open=()=>{bag.current?.showModal();void query();};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setMenu(false);};
  window.addEventListener('storage',sync);window.addEventListener('magenta-bag',sync);window.addEventListener('atelier-open-bag',open);window.addEventListener('keydown',escape);
  return()=>{window.removeEventListener('storage',sync);window.removeEventListener('magenta-bag',sync);window.removeEventListener('atelier-open-bag',open);window.removeEventListener('keydown',escape);};
 // The deployment binds brandId; changing it remounts all bag state.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[brandId]);
 const nav=<><Link href="/catalogo">Comprar</Link><Link href="/#categories">Colecciones</Link><Link href="/#wholesale">Mayoreo</Link></>;
 return <><div className="announcement">MENUDEO Y MAYOREO · MAGENTA FITWEAR</div><div className="atelier-header-wrap"><header className="header"><button className="icon mobile-menu" aria-label={menu?'Cerrar menú':'Abrir menú'} aria-expanded={menu} aria-controls="MainMenu" onClick={()=>setMenu(!menu)}><AtelierIcon name={menu?'close':'menu'}/></button><Link className="logo" href="/" aria-label={name+' · Inicio'}><AtelierLogo identity="header" src={logo} name={name}/></Link><nav id="MainMenu" className={menu?'open':''} aria-label="Principal" onClick={()=>setMenu(false)}>{nav}</nav><div className="header-actions"><button className="icon" onClick={()=>search.current?.showModal()} aria-label="Buscar"><AtelierIcon name="search"/></button><Link className="icon" href="/pedidos" aria-label="Consultar mis pedidos"><AtelierIcon name="user"/></Link><button className="icon bag" onClick={openBag} aria-label={'Abrir bolsa: '+count+' unidades'}><AtelierIcon name="bag"/><span aria-live="polite">{count}</span></button></div></header></div>
 <dialog ref={search} className="atelier-search" aria-labelledby="atelier-search-title"><div className="drawer-heading"><h2 id="atelier-search-title">Tu próximo favorito.</h2><button className="icon" aria-label="Cerrar búsqueda" onClick={()=>search.current?.close()}><AtelierIcon name="close"/></button></div><form action="/catalogo" method="get"><label htmlFor="atelier-query">Busca una prenda, colección o color</label><div><input autoFocus id="atelier-query" name="q" type="search" maxLength={150} placeholder="Leggings, tops, conjuntos…"/><button className="button" type="submit">Buscar <AtelierIcon name="search"/></button></div></form></dialog>
 <dialog ref={bag} className="atelier-bag" aria-labelledby="atelier-bag-title"><div className="drawer-heading"><h2 id="atelier-bag-title">Tu bolsa <small>({count})</small></h2><button className="icon" aria-label="Cerrar bolsa" onClick={()=>bag.current?.close()}><AtelierIcon name="close"/></button></div>{busy&&<p role="status">Actualizando tu bolsa…</p>}{error&&<p role="alert">{error} <button onClick={()=>void query()}>Reintentar</button></p>}
 {!count?<div className="drawer-empty"><AtelierIcon name="bag"/><h3>Tu próximo favorito está esperando.</h3><Link className="button" href="/catalogo">Explorar colección ↗</Link></div>:<><div className="atelier-bag-items">{quote?.items.map(item=><article className="atelier-bag-item" key={item.variantId}><Link href={'/productos/'+item.productId+'?variant='+item.variantId}><strong>{item.name}</strong></Link><p>{item.variantName}</p><p>{money(item.unitCents,quote.currency)}</p><div className="drawer-item-controls"><button disabled={busy||item.quantity<=1} aria-label={'Reducir '+item.name} onClick={()=>void change(item.variantId,item.quantity-1)}>−</button><span aria-label="Cantidad">{item.quantity}</span><button disabled={busy||item.quantity>=99} aria-label={'Aumentar '+item.name} onClick={()=>void change(item.variantId,item.quantity+1)}>+</button><button disabled={busy} onClick={()=>void change(item.variantId,0)}>Eliminar</button><strong>{money(item.totalCents,quote.currency)}</strong></div>{!item.available&&<p role="status">Revisa la disponibilidad antes de continuar.</p>}</article>)}</div>{quote&&<div className="atelier-bag-summary"><p className="cart-subtotal"><span>Productos</span><strong>{money(quote.subtotalCents,quote.currency)}</strong></p>{!!quote.discountCents&&<p>Descuento: {money(quote.discountCents,quote.currency)}</p>}<p>Envío y total final confirmados al pagar.</p><Link className="button" href="/checkout">Continuar al pago ↗</Link><Link href="/bolsa">Ver mi bolsa</Link></div>}</>}
 </dialog></>;
}

export function AtelierMotion(){
 useEffect(()=>{if(matchMedia('(prefers-reduced-motion: reduce)').matches||!('IntersectionObserver'in window))return;
 const nodes=[...document.querySelectorAll<HTMLElement>('.section-heading,.editorial-card,.look-content,.footer-column')];
 const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.remove('is-pending');observer.unobserve(entry.target);}}),{threshold:.05});
 nodes.forEach(node=>{if(node.getBoundingClientRect().top>innerHeight){node.classList.add('reveal-target','is-pending');observer.observe(node);}});
 return()=>{observer.disconnect();nodes.forEach(node=>node.classList.remove('is-pending'));};
 },[]);return null;
}
