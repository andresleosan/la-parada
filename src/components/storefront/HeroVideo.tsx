// src/components/storefront/HeroVideo.tsx
import { useEffect, useRef, useState } from 'react';

type Orientation = 'landscape' | 'portrait';

interface HeroMedia {
  video: string;
  poster: string;
  width: number;
  height: number;
}

/**
 * Loop corto (8–18 s, sin audio) generado con scripts/build-hero-video.sh a partir de
 * clips de Pexels (licencia libre para uso comercial). Un único video para todo el día,
 * con versión horizontal para escritorio y vertical para móvil para no descargar
 * píxeles de más.
 */
const HERO_MEDIA: Record<Orientation, HeroMedia> = {
  landscape: {
    video: '/media/hero/hero-landscape.mp4',
    poster: '/media/hero/hero-landscape.webp',
    width: 1280,
    height: 720,
  },
  portrait: {
    video: '/media/hero/hero-portrait.mp4',
    poster: '/media/hero/hero-portrait.webp',
    width: 720,
    height: 1280,
  },
};

const PORTRAIT_QUERY = '(max-width: 767px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

// React 18 no reconoce `fetchPriority`; el atributo en minúsculas llega al DOM sin advertencias.
const POSTER_PRIORITY = { fetchpriority: 'high' } as object;

function canMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

function getOrientation(): Orientation {
  if (!canMatchMedia()) return 'landscape';
  return window.matchMedia(PORTRAIT_QUERY).matches ? 'portrait' : 'landscape';
}

/**
 * El video es decorativo: si el usuario pidió menos movimiento o activó ahorro de datos,
 * se muestra solo el póster.
 */
function shouldPlayVideo(): boolean {
  if (!canMatchMedia()) return false;
  if (window.matchMedia(REDUCED_MOTION_QUERY).matches) return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return false;
  return true;
}

interface HeroVideoProps {
  className?: string;
}

export function HeroVideo({ className = '' }: HeroVideoProps) {
  const [orientation, setOrientation] = useState<Orientation>(getOrientation);
  const [videoEnabled, setVideoEnabled] = useState<boolean>(shouldPlayVideo);
  const [ready, setReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const media = HERO_MEDIA[orientation];

  useEffect(() => {
    if (!canMatchMedia()) return;
    const portrait = window.matchMedia(PORTRAIT_QUERY);
    const motion = window.matchMedia(REDUCED_MOTION_QUERY);
    const update = () => {
      setOrientation(portrait.matches ? 'portrait' : 'landscape');
      setVideoEnabled(shouldPlayVideo());
    };
    portrait.addEventListener('change', update);
    motion.addEventListener('change', update);
    return () => {
      portrait.removeEventListener('change', update);
      motion.removeEventListener('change', update);
    };
  }, []);

  // Al cambiar de orientación el <video> se remonta; el póster cubre mientras carga.
  useEffect(() => {
    setReady(false);
  }, [media.video]);

  // Pausa el loop cuando el hero sale de pantalla para no gastar CPU ni batería.
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container || !videoEnabled || typeof IntersectionObserver === 'undefined') {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {
            /* autoplay bloqueado: el póster ya está visible */
          });
        } else {
          video.pause();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [videoEnabled, media.video]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      data-testid="hero-video"
      className={`pointer-events-none absolute inset-0 overflow-hidden bg-[#0d0907] ${className}`}
    >
      <img
        src={media.poster}
        alt=""
        width={media.width}
        height={media.height}
        loading="eager"
        decoding="async"
        {...POSTER_PRIORITY}
        className="absolute inset-0 h-full w-full object-cover"
      />

      {videoEnabled && (
        <video
          key={media.video}
          ref={videoRef}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out ${
            ready ? 'opacity-100' : 'opacity-0'
          }`}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster={media.poster}
          disablePictureInPicture
          disableRemotePlayback
          tabIndex={-1}
          onCanPlay={() => setReady(true)}
          onPlaying={() => setReady(true)}
        >
          <source src={media.video} type="video/mp4" />
        </video>
      )}

      {/* Velos para legibilidad: desde abajo en móvil, desde la izquierda en escritorio. */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0d0907] via-[#0d0907]/60 to-[#0d0907]/10 md:bg-gradient-to-r md:from-[#0d0907]/90 md:via-[#0d0907]/55 md:to-[#0d0907]/5" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#0d0907]/80 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0d0907] to-transparent" />
      <div className="hero-grain absolute inset-0" />
    </div>
  );
}
