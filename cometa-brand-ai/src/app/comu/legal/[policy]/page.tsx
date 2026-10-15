import Link from "next/link";
import { notFound } from "next/navigation";
import { policies } from "../policies";
export function generateStaticParams() { return Object.keys(policies).map(policy => ({ policy })); }
export default async function Policy({ params }: { params: Promise<{ policy: string }> }) {
  const slug = (await params).policy;
  if (!Object.hasOwn(policies, slug)) notFound();
  const policy = policies[slug as keyof typeof policies];
  return <main className="mx-auto max-w-6xl px-5 py-12 md:py-20"><Link href="/comu/legal" className="text-sm text-[#72675e]">← Centro legal</Link><header className="my-12 max-w-3xl"><p className="comu-eyebrow">COMU · información para nuestra comunidad</p><h1 className="comu-title mt-5">{policy.title}</h1><p className="mt-6 text-lg leading-8 text-[#72675e]">{policy.intro}</p></header><div className="grid items-start gap-12 md:grid-cols-[210px_1fr]"><nav aria-label="Contenido del documento" className="space-y-3 border-t border-[#d9cfc4] pt-5 text-sm md:sticky md:top-44">{policy.sections.map(([title], index) => <a key={title} className="block leading-6 text-[#72675e]" href={`#section-${index}`}>{title}</a>)}</nav><article className="max-w-2xl space-y-12">{policy.sections.map(([title, text], index) => <section id={`section-${index}`} key={title} className="scroll-mt-48"><h2 className="text-2xl font-semibold tracking-tight">{title}</h2><p className="mt-4 whitespace-pre-wrap leading-8 text-[#5e655e]">{text}</p></section>)}</article></div></main>;
}
