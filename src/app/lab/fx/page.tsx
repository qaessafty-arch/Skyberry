"use client";
import { useEffect, useRef, useState } from "react";
import { Fx, NO_FX, detectFace, type ArMask, type Background, type Funny, type FxOptions } from "@/modules/camera/fx";
import { modelsPresent } from "@/modules/camera/vision";

/** Backend-free effects lab: runs the real pipeline on a still portrait (?img=/path) so results can be inspected. */
export default function FxLab() {
  const cv = useRef<HTMLCanvasElement>(null); const [status, setStatus] = useState("loading"); const [o, setO] = useState<FxOptions>({ ...NO_FX, mask: "sunglasses", background: "blur" });
  const [info, setInfo] = useState("");
  useEffect(() => { (async () => {
    if (!(await modelsPresent())) return setStatus("no-models");
    const src = new URLSearchParams(location.search).get("img") ?? "/portrait.jpg"; const img = new Image(); img.src = src; await img.decode(); const bmp = await createImageBitmap(img);
    const c = cv.current!; c.width = Math.min(640, bmp.width); c.height = Math.round((c.width / bmp.width) * bmp.height);
    const swapSrc = new URLSearchParams(location.search).get("swap");
    let opts = o; if (swapSrc) { const si = new Image(); si.src = swapSrc; await si.decode(); const sb = await createImageBitmap(si); const f = await detectFace(sb); if (f) opts = { ...o, swap: { bitmap: sb, frame: f.frame, oval: f.oval } }; }
    const fx = new Fx(); await fx.init(true, true);
    const draw = async () => { const ctx = c.getContext("2d")!; ctx.filter = "none"; ctx.drawImage(bmp, 0, 0, c.width, c.height); const t0 = performance.now(); await fx.update(c, opts, 1000); await new Promise((r) => setTimeout(r, 120)); ctx.drawImage(bmp, 0, 0, c.width, c.height); await fx.update(c, opts, 2000); fx.apply(c, opts, 1500); setInfo(JSON.stringify({ face: !!fx.face, eyeDist: Math.round(fx.face?.eyeDist ?? 0), ms: Math.round(performance.now() - t0) })); setStatus("done"); };
    draw();
  })().catch((e) => setStatus("error:" + e.message)); }, [o]);
  const B: Background[] = ["none", "blur", "ocean", "sunset", "night"], M: ArMask[] = ["none", "sunglasses", "party", "crown", "bunny", "cat", "bubbles"], F: Funny[] = ["off", "bighead", "tinyface", "bigeyes"];
  return <main style={{ padding: 16 }}><h1>Effects lab</h1><p data-testid="status">{status}</p><p data-testid="info">{info}</p>
    <div className="row">{B.map((b) => <button key={b} className="btn ghost" onClick={() => setO({ ...o, background: b })}>bg:{b}</button>)}{M.map((m) => <button key={m} className="btn ghost" onClick={() => setO({ ...o, mask: m })}>{m}</button>)}{F.map((f) => <button key={f} className="btn ghost" onClick={() => setO({ ...o, funny: f })}>funny:{f}</button>)}</div>
    <canvas ref={cv} data-testid="out" style={{ maxWidth: "100%", marginTop: 12, borderRadius: 12 }} /></main>;
}
