"use client";
import { usePosContext } from "../../../components/pos-shell";
import { AppearanceEditor } from "./appearance-editor";
export default function Page() { const { brand } = usePosContext(); return <AppearanceEditor key={brand.slug} brandSlug={brand.slug} />; }
