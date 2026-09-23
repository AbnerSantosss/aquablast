"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import { heroVideo } from "@/data/videos";
import { useSelection } from "./SelectionProvider";

interface ControlsState {
  muted: boolean;
  paused: boolean;
  fullscreen: boolean;
}

type FullscreenCapableVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

const noopSubscribe = () => () => {};
const fullscreenUnsupported = () =>
  !document.fullscreenEnabled &&
  typeof (HTMLVideoElement.prototype as FullscreenCapableVideo).webkitEnterFullscreen !== "function";

/**
 * Vídeo de destaque do hero. Reproduz (mudo, em loop) sempre que a galeria entra no
 * modo vídeo e pausa quando uma foto é escolhida — como o app.js original.
 */
export function HeroFeaturedVideo() {
  const { pack, videoActive, videoRequest, selectHeroOption } = useSelection();
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [controls, setControls] = useState<ControlsState>({ muted: true, paused: false, fullscreen: false });
  const fullscreenHidden = useSyncExternalStore(noopSubscribe, fullscreenUnsupported, () => false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => {
      setControls({
        muted: video.muted,
        paused: video.paused,
        fullscreen: document.fullscreenElement === frameRef.current,
      });
    };
    const events = ["play", "pause", "ended", "volumechange"];
    events.forEach((event) => video.addEventListener(event, sync));
    document.addEventListener("fullscreenchange", sync);
    return () => {
      events.forEach((event) => video.removeEventListener(event, sync));
      document.removeEventListener("fullscreenchange", sync);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Sem `controls` nativos: a barra própria substitui (syncHeroControlMode do original).
    video.controls = false;
    if (videoActive) {
      video.defaultMuted = true;
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
      video.play().catch(() => {
        // Autoplay bloqueado: os eventos pause/volumechange mantêm os controles em dia.
      });
      return;
    }
    video.autoplay = false;
    video.pause();
  }, [videoActive, videoRequest]);

  const toggleSound = () => {
    const video = videoRef.current;
    if (video) video.muted = !video.muted;
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const toggleFullscreen = () => {
    const video = videoRef.current as FullscreenCapableVideo | null;
    const frame = frameRef.current;
    if (!video || !frame) return;
    if (document.fullscreenElement === frame) document.exitFullscreen().catch(() => {});
    else if (document.fullscreenEnabled) frame.requestFullscreen().catch(() => {});
    else if (typeof video.webkitEnterFullscreen === "function") video.webkitEnterFullscreen();
  };

  const onCta = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    selectHeroOption(pack === "kit" ? 1 : 0);
  };

  const soundLabel = controls.muted ? "Ativar som do vídeo" : "Silenciar vídeo";
  const playLabel = controls.paused ? "Reproduzir vídeo" : "Pausar vídeo";
  const fullscreenLabel = controls.fullscreen ? "Sair da tela cheia" : "Ampliar vídeo";
  const controlsClass = ["hero-video-controls", controls.muted && "is-muted", controls.paused && "is-paused"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="hero-featured-video" ref={frameRef}>
      <div className="hero-video-copy">
        <span className="eyebrow">VEJA O AQUABLAST EM AÇÃO</span>
        <h2>
          Conheça antes
          <br />
          de escolher.
        </h2>
        <p>Assista ao vídeo e escolha entre uma unidade ou o kit com dois.</p>
      </div>
      <video
        ref={videoRef}
        playsInline
        preload="metadata"
        poster={heroVideo.poster}
        src={heroVideo.src}
        aria-label="Vídeo de destaque do AquaBlast"
      />
      <div className={controlsClass} role="group" aria-label="Controles do vídeo AquaBlast">
        <button
          className="hero-video-expand"
          type="button"
          data-hero-fullscreen=""
          aria-label={fullscreenLabel}
          title={fullscreenLabel}
          hidden={fullscreenHidden}
          onClick={toggleFullscreen}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5" />
          </svg>
        </button>
        <div className="hero-video-actions">
          <button
            className="hero-video-sound"
            type="button"
            data-hero-sound=""
            aria-label={soundLabel}
            title={soundLabel}
            onClick={toggleSound}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m11 5-6 4H2v6h3l6 4V5Z" />
              <path className="sound-off-mark" d="m17 9 5 6m0-6-5 6" />
              <path className="sound-on-mark" d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
            </svg>
            <span>{controls.muted ? "Ativar som" : "Silenciar"}</span>
          </button>
          <button
            className="hero-video-play"
            type="button"
            data-hero-play=""
            aria-label={playLabel}
            title={playLabel}
            onClick={togglePlay}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path className="pause-mark" d="M8 5v14M16 5v14" />
              <path className="play-mark" d="m7 4 14 8-14 8V4Z" />
            </svg>
          </button>
        </div>
      </div>
      <a className="button button-green hero-video-cta" data-select-hero="" href="#ofertas" onClick={onCta}>
        Escolher meu AquaBlast
      </a>
    </div>
  );
}
