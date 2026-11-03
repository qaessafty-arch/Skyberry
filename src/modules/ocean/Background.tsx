"use client";
import dynamic from "next/dynamic";
export const Background = dynamic(() => import("./OceanBackground").then((m) => m.OceanBackground), { ssr: false });
