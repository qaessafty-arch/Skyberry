"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { EditedVideo } from "@/modules/camera/VideoEditor";
import type { Shot } from "@/modules/camera/CameraStudio";

const CameraStudio = dynamic(() => import("@/modules/camera/CameraStudio").then((m) => m.CameraStudio), { ssr: false });
/** Backend-free camera sandbox (fake devices in tests). Shows what the Studio produced. */
export default function CameraLab() {
  const [photo, setPhoto] = useState<Shot | null>(null); const [video, setVideo] = useState<EditedVideo | null>(null);
  return <main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}><h1>Camera lab</h1>
    {video ? <div className="glass card"><video data-testid="result-video" src={video.url} controls style={{ width: "100%" }} /><p data-testid="result-info">{video.width}x{video.height} {video.label} {Math.round(video.durationMs)}ms {video.mime} cover:{video.cover ? "yes" : "no"}</p></div>
      : photo ? <div className="glass card"><img data-testid="result-photo" src={photo.url} alt="" style={{ width: "100%" }} /><p data-testid="result-info">{photo.w}x{photo.h}</p></div>
      : <CameraStudio onDone={setPhoto} onDoneVideo={setVideo} />}</main>;
}
