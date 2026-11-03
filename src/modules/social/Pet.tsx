"use client";
import dynamic from "next/dynamic";
export const PetStage = dynamic(() => import("@/modules/pets/PetStage").then((m) => m.PetStage), { ssr: false, loading: () => <div className="glass" style={{ height: 220 }} /> });
