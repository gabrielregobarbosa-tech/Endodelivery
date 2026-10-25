'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { api } from '@/components/api';
import { Button, Field, Notice } from '@/components/ui';
export default function LoginPage() {
  const router = useRouter(); const [busy, setBusy] = useState(false), [error, setError] = useState(''), [show, setShow] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError(''); try { await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: data.get('email'), password: data.get('password') }) }); router.replace('/patients'); router.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <div className="auth-form"><span className="welcome-icon"><LockKeyhole size={24} /></span><span className="eyebrow">BEM-VINDO DE VOLTA</span><h2>Acesse seu<br />espaço profissional.</h2><p className="muted">Entre para consultar seus pacientes, agenda e documentos.</p><form onSubmit={submit} className="stack">{error && <Notice>{error}</Notice>}<Field label="E-mail"><input className="input" name="email" type="email" autoComplete="email" required placeholder="voce@consultorio.com.br" /></Field><Field label="Senha"><div className="password-field"><input className="input" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required placeholder="Sua senha" /><button type="button" aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></Field><Button disabled={busy} type="submit" className="button-full">{busy ? 'Entrando…' : 'Entrar no EndoDelivery'}<ArrowRight size={18} /></Button></form><p className="auth-switch">É seu primeiro acesso? <Link href="/register">Criar minha conta</Link></p></div>;
}
