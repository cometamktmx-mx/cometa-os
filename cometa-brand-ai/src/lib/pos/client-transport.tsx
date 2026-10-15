"use client";
import { createContext, useContext } from "react";
export type PosFetch = (input: string, init?: RequestInit) => Promise<Response>;
const browserFetch: PosFetch = (input, init) => fetch(input, init);
export const PosTransportContext = createContext<PosFetch>(browserFetch);
export const usePosFetch = () => useContext(PosTransportContext);
