import { Brand, BrandMark } from "@/components/brand";
import { ClipboardList, ShieldCheck } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="auth-layout">
    <section className="auth-story">
      <Brand />
      <div className="auth-story-body">
        <span className="auth-pill"><ClipboardList size={15} /> Gestão clínica em endodontia</span>
        <h1>Seu prontuário endodôntico, <em>onde você estiver.</em></h1>
        <p>Pacientes, histórico clínico e documentos.<br />Organizados para acompanhar sua rotina profissional.</p>
        <div className="auth-illustration">
          <div className="illustration-card">
            <BrandMark size={68} className="illustration-brand" />
            <div><strong>Um prontuário completo</strong><small>Tratamentos, canais e radiografias reunidos.</small></div>
          </div>
        </div>
      </div>
      <div className="auth-story-footer"><ShieldCheck size={17} /> Acesso individual aos seus registros clínicos.</div>
    </section>
    <section className="auth-form-section">
      <div className="auth-mobile-brand"><Brand /><p className="auth-mobile-slogan">Seu prontuário endodôntico, onde você estiver.</p></div>
      {children}
      <p className="auth-footer">EndoDelivery · Gestão clínica em endodontia.</p>
    </section>
  </main>;
}
