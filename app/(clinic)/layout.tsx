'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { UsersRound, CalendarDays, Files, UserRound, ChevronRight, ShieldCheck } from 'lucide-react';
import { Brand } from '@/components/brand';
import { Spinner } from '@/components/ui';

const links = [{ href: '/patients', label: 'Pacientes', icon: UsersRound }, { href: '/agenda', label: 'Agenda do dia', mobile: 'Agenda', icon: CalendarDays }, { href: '/documents', label: 'Documentos', icon: Files }, { href: '/profile', label: 'Meu perfil', mobile: 'Perfil', icon: UserRound }];
export default function ClinicLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname(), router = useRouter();
  const [user, setUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { let active = true; fetch('/api/auth/me', { cache: 'no-store' }).then(async response => { if (response.status === 401) { router.replace('/login'); return; } if (!response.ok) throw new Error(); const result = await response.json(); if (active) setUser(result.user); }).catch(() => { if (active) setFailed(true); }); return () => { active = false; }; }, [router]);
  useEffect(() => { const theme = localStorage.getItem('endodelivery-theme') || 'system'; document.documentElement.setAttribute('data-theme', theme); }, []);
  if (failed) return <div className="auth-wait"><p>Não foi possível conectar. Verifique sua conexão.</p><button className="button button-primary" onClick={() => window.location.reload()}>Tentar novamente</button></div>;
  if (!user) return <div className="auth-wait"><Brand /><Spinner /></div>;
  return <div className="app-shell"><aside className="sidebar"><Link href="/patients" aria-label="EndoDelivery início"><Brand /></Link><div className="sidebar-section-label">SEU CONSULTÓRIO</div><nav aria-label="Menu principal" className="sidebar-nav">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${path.startsWith(href) ? 'active' : ''}`} aria-current={path.startsWith(href) ? 'page' : undefined}><Icon size={20} /><span>{label}</span>{path.startsWith(href) && <ChevronRight size={16} className="nav-arrow" />}</Link>)}</nav><div className="sidebar-bottom"><div className="privacy-note"><ShieldCheck size={18} /><span>Seu espaço de cuidado.<br /><strong>Privado e organizado.</strong></span></div><Link href="/profile" className="user-card"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><span><strong>{user.name}</strong><small>Meu perfil profissional</small></span><ChevronRight size={16} /></Link></div></aside><div className="workspace"><header className="topbar"><div className="mobile-brand"><Brand compact /></div><span className="topbar-greeting">Bom cuidado começa com organização.</span><div className="topbar-right"><span className="today-label">{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</span><Link className="avatar avatar-sm" href="/profile" aria-label="Abrir meu perfil">{user.name.slice(0, 1).toUpperCase()}</Link></div></header><main className="main-content">{children}</main></div><nav className="bottom-nav" aria-label="Navegação principal">{links.map(({ href, label, mobile, icon: Icon }) => <Link key={href} href={href} className={path.startsWith(href) ? 'active' : ''} aria-current={path.startsWith(href) ? 'page' : undefined}><Icon size={21} /><span>{mobile || label}</span></Link>)}</nav></div>;
}
