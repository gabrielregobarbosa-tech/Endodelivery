"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import type { ChangeEvent, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, ImagePlus, LogOut, Monitor, Moon, ShieldCheck, Sun, Trash2, UserRound } from "lucide-react";
import { api } from "@/components/api";
import { Button, Field, Notice, PageHeader, Spinner } from "@/components/ui";

type Profile = { name: string; specialty: string; cro: string; phone: string; email: string; address: string; logo_data_url: string };
type Theme = "light" | "dark" | "system";
const emptyProfile: Profile = { name: "", specialty: "", cro: "", phone: "", email: "", address: "", logo_data_url: "" };
function subscribeTheme(listener: () => void) { window.addEventListener("storage", listener); window.addEventListener("endodelivery-theme", listener); return () => { window.removeEventListener("storage", listener); window.removeEventListener("endodelivery-theme", listener); }; }
function getTheme(): Theme { const value = localStorage.getItem("endodelivery-theme"); return value === "light" || value === "dark" ? value : "system"; }

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>({ ...emptyProfile });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => "system" as Theme);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ profile: Profile }>("/api/profile").then((data) => setProfile({ ...emptyProfile, ...data.profile })).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Não foi possível carregar o perfil.")).finally(() => setLoading(false));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setSuccess("");
    try { const data = await api<{ profile: Profile }>("/api/profile", { method: "PUT", body: JSON.stringify(profile) }); setProfile({ ...emptyProfile, ...data.profile }); setSuccess("Perfil salvo. Seus próximos documentos usarão estas informações."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar o perfil."); }
    finally { setSaving(false); }
  }

  function chooseTheme(value: Theme) {
    localStorage.setItem("endodelivery-theme", value);
    if (value === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", value);
    window.dispatchEvent(new Event("endodelivery-theme"));
  }

  async function chooseLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setError(""); setSuccess("");
    if (!["image/png", "image/jpeg"].includes(file.type)) { setError("Escolha uma imagem PNG ou JPEG para o logotipo."); event.target.value = ""; return; }
    if (file.size > 750_000) { setError("O logotipo deve ter até 750 KB."); event.target.value = ""; return; }
    try {
      const url = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Não foi possível ler a imagem.")); reader.readAsDataURL(file); });
      setProfile((current) => ({ ...current, logo_data_url: url }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar o logotipo."); }
    event.target.value = "";
  }

  async function logout() {
    setSaving(true); setError("");
    try { await api("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível sair da conta."); setSaving(false); }
  }

  return <div className="page">
    <PageHeader eyebrow="Sua identidade profissional" title="Meu perfil" description="Um toque pessoal em cada cuidado." />
    {error && <Notice kind="error">{error}</Notice>}{success && <Notice kind="success">{success}</Notice>}
    {loading ? <Spinner /> : <div className="profile-grid">
      <form className="card stack" onSubmit={save}>
        <div className="card-header"><div><h2>Informações profissionais</h2><p className="muted">Usadas no cabeçalho de relatórios e documentos.</p></div></div>
        <div className="card-body stack">
          <div className="profile-brand-row"><div className="profile-logo">{profile.logo_data_url ? <Image unoptimized width={150} height={150} src={profile.logo_data_url} alt="Logotipo profissional" /> : <UserRound size={32} />}</div><div className="stack compact"><h3>Seu logotipo</h3><p className="muted">PNG ou JPEG, até 750 KB.</p><div className="actions"><Button variant="secondary" size="sm" type="button" onClick={() => fileInput.current?.click()}><ImagePlus size={16} /> {profile.logo_data_url ? "Trocar imagem" : "Adicionar imagem"}</Button>{profile.logo_data_url && <Button variant="ghost" size="sm" type="button" aria-label="Remover logotipo" onClick={() => setProfile({ ...profile, logo_data_url: "" })}><Trash2 size={16} /></Button>}</div><input ref={fileInput} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => void chooseLogo(event)} /></div></div>
          <Field label="Nome profissional"><input className="input" autoComplete="name" required maxLength={160} value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} placeholder="Como você assina seus documentos" /></Field>
          <div className="form-grid"><Field label="Especialidade"><input className="input" maxLength={120} value={profile.specialty} onChange={(event) => setProfile({ ...profile, specialty: event.target.value })} placeholder="Endodontia" /></Field><Field label="CRO"><input className="input" maxLength={60} value={profile.cro} onChange={(event) => setProfile({ ...profile, cro: event.target.value })} placeholder="UF 00000" /></Field></div>
          <div className="form-grid"><Field label="Telefone profissional"><input className="input" type="tel" autoComplete="tel" maxLength={40} value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} placeholder="(00) 00000-0000" /></Field><Field label="E-mail profissional"><input className="input" type="email" autoComplete="email" maxLength={254} value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} placeholder="voce@clinica.com.br" /></Field></div>
          <Field label="Endereço profissional"><textarea className="textarea" rows={2} autoComplete="street-address" maxLength={500} value={profile.address} onChange={(event) => setProfile({ ...profile, address: event.target.value })} placeholder="Clínica, endereço e cidade" /></Field>
          <div className="actions"><Button type="submit" disabled={saving}><Check size={18} /> {saving ? "Salvando…" : "Salvar perfil"}</Button></div>
        </div>
      </form>
      <div className="stack">
        <section className="card"><div className="card-header"><div><h2>Do seu jeito</h2><p className="muted">Escolha a aparência do aplicativo.</p></div></div><div className="card-body"><div className="theme-options">{([{ value: "light", label: "Claro", icon: Sun }, { value: "dark", label: "Escuro", icon: Moon }, { value: "system", label: "Sistema", icon: Monitor }] as const).map(({ value, label, icon: Icon }) => <button type="button" key={value} className={`theme-option ${theme === value ? "active" : ""}`} onClick={() => chooseTheme(value)} aria-pressed={theme === value}><Icon size={23} /><span>{label}</span></button>)}</div></div></section>
        <section className="card"><div className="card-body stack"><div className="privacy-icon"><ShieldCheck size={24} /></div><h2>Seu espaço de trabalho</h2><p className="muted">Pacientes, radiografias e documentos ficam vinculados à sua conta. Ao usar um dispositivo compartilhado, encerre a sessão quando terminar.</p><Button variant="secondary" onClick={() => void logout()} disabled={saving}><LogOut size={17} /> Sair da conta</Button></div></section>
      </div>
    </div>}
  </div>;
}
