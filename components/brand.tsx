import Image from "next/image";

/** The application and exported icon assets share the same original SVG source. */
export function BrandMark({ size = 40, className = "", label = "" }: {
  size?: number;
  className?: string;
  label?: string;
}) {
  return <Image className={`brand-symbol ${className}`} src="/brand/mark.svg" width={size} height={size} alt={label} unoptimized />;
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={`brand ${compact ? "brand-compact" : ""}`}>
    <span className="brand-mark"><BrandMark /></span>
    <span><strong>Endo<span>Delivery</span></strong></span>
  </span>;
}
