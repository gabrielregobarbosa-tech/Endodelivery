'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, UserRoundPlus } from 'lucide-react';
import { api } from '@/components/api';
import { Button, Field, Notice } from '@/components/ui';
export default function RegisterPage() {
  const router = useRouter(); const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); if (data.get('password') !== data.get('confirm')) { setError('As senhas precisam ser iguais.'); return; } setBusy(true); setError(''); try { await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: data.get('name'), email: data.get('email'), password: data.get('password') }) }); router.replace('/patients'); router.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <div className="auth-form"><span className="welcome-icon"><UserRoundPlus size={24} /></span><span className="eyebrow">UM NOVO JEITO DE CUIDAR</span><h2>Vamos começar?</h2><p className="muted">Crie seu espaço profissional no EndoDelivery.</p><form onSubmit={submit} className="stack">{error && <Notice>{error}</Notice>}<Field label="Seu nome profissional"><input className="input" name="name" autoComplete="name" required minLength={2} maxLength={120} placeholder="Como você quer ser chamado(a)" /></Field><Field label="E-mail"><input className="input" name="email" type="email" autoComplete="email" required placeholder="voce@consultorio.com.br" /></Field><Field label="Senha" hint="Use pelo menos 10 caracteres."><input className="input" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} /></Field><Field label="Confirme a senha"><input className="input" name="confirm" type="password" autoComplete="new-password" required minLength={10} maxLength={128} /></Field><Button disabled={busy} type="submit" className="button-full">{busy ? 'Criando sua conta…' : 'Criar minha conta'}<ArrowRight size={18} /></Button></form><p className="auth-switch">Já tem uma conta? <Link href="/login">Entrar</Link></p></div>;
}
