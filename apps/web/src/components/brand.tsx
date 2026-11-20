import Image from 'next/image';

/**
 * The FN monogram, redrawn as SVG from the supplied logo: an F whose middle
 * arm becomes the N diagonal, with the ochre cut. Used as favicon, collapsed
 * sidebar mark and app icon.
 */
export function FnMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="FABNIX">
      <path d="M10 8h26v6H17v14h14l-4 6H17v22h-7z" fill="currentColor" />
      <path d="M48 8h6v48h-6L27.5 34.5 31 30l17 18z" fill="currentColor" />
      <path d="M21 14h10l12 12.8-5 5.2z" fill="var(--accent, #C89654)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <FnMark size={26} />
      <span className="text-lg font-semibold tracking-[0.25em]">FABNIX</span>
    </span>
  );
}

/** Full raster logo (FN + wordmark) for marketing surfaces. */
export function LogoImage({ size = 160 }: { size?: number }) {
  return <Image src="/brand/fabnix-logo.jpg" alt="FABNIX · EST. 2026" width={size} height={size} priority className="rounded-lg" />;
}
