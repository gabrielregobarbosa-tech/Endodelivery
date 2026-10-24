import { Activity } from 'lucide-react';
export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={`brand ${compact ? 'brand-compact' : ''}`}><span className="brand-mark"><Activity size={23} strokeWidth={2.4} /></span><span><strong>Endo<span>Delivery</span></strong>{!compact && <small>CUIDADO EM CADA DETALHE</small>}</span></span>;
}
