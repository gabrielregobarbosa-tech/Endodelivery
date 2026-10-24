"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Download, FilePenLine, FileText, Plus, Share2, Trash2, WandSparkles } from "lucide-react";
import { api, sharePdf } from "@/components/api";
import { Button, EmptyState, Field, Modal, Notice, PageHeader, Spinner } from "@/components/ui";

type Kind = "prescription" | "post_op";
type Template = { id: string; title: string; kind: Kind; content: string };
type Patient = { id: string; name: string };
type DocumentRecord = { id: string; title: string; kind: Kind; content: string; patient_id: string | null; patient_name?: string; created_at: string };
type Draft = { title: string; kind: Kind; content: string; patient_id: string; template_id: string };
const emptyDraft: Draft = { title: "", kind: "prescription", content: "", patient_id: "", template_id: "" };
const kindLabel = (kind: Kind) => kind === "prescription" ? "Receituário" : "Pós-operatório";

export default function DocumentsPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [documentOpen, setDocumentOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [draft, setDraft] = useState<Draft>({ ...emptyDraft });
  const [templateDraft, setTemplateDraft] = useState({ title: "", kind: "prescription" as Kind, content: "" });
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const [templateData, documentData, patientData] = await Promise.all([
        api<{ templates: Template[] }>("/api/templates"),
        api<{ documents: DocumentRecord[] }>("/api/documents"),
        api<{ patients: Patient[] }>("/api/patients"),
      ]);
      setTemplates(templateData.templates);
      setDocuments(documentData.documents);
      setPatients(patientData.patients);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar os documentos."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([api<{ templates: Template[] }>("/api/templates"), api<{ documents: DocumentRecord[] }>("/api/documents"), api<{ patients: Patient[] }>("/api/patients")]).then(([templateData, documentData, patientData]) => {
      if (!active) return;
      setTemplates(templateData.templates); setDocuments(documentData.documents); setPatients(patientData.patients);
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar os documentos."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => documents.filter((document) => `${document.title} ${document.patient_name ?? patients.find((patient) => patient.id === document.patient_id)?.name ?? ""}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))), [documents, patients, query]);

  function openDocument(template?: Template) {
    setError(""); setSuccess("");
    setDraft(template ? { ...emptyDraft, title: template.title, kind: template.kind, content: template.content, template_id: template.id } : { ...emptyDraft });
    setDocumentOpen(true);
  }

  function chooseTemplate(id: string) {
    const template = templates.find((item) => item.id === id);
    if (!template) { setDraft((current) => ({ ...current, template_id: "" })); return; }
    const name = patients.find((item) => item.id === draft.patient_id)?.name;
    setDraft((current) => ({ ...current, template_id: id, title: template.title, kind: template.kind, content: name ? template.content.replaceAll("{{paciente}}", name) : template.content }));
  }

  async function saveDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const patient = patients.find((item) => item.id === draft.patient_id);
      await api("/api/documents", { method: "POST", body: JSON.stringify({ ...draft, patient_id: draft.patient_id || null, template_id: draft.template_id || null, content: patient ? draft.content.replaceAll("{{paciente}}", patient.name) : draft.content }) });
      setDocumentOpen(false); setSuccess("Documento salvo. O PDF está pronto para baixar ou compartilhar."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar o documento."); }
    finally { setBusy(false); }
  }

  function openTemplate(template?: Template) {
    setError(""); setEditingTemplate(template ?? null);
    setTemplateDraft(template ? { title: template.title, kind: template.kind, content: template.content } : { title: "", kind: "prescription", content: "" });
    setTemplateOpen(true);
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api(editingTemplate ? `/api/templates/${editingTemplate.id}` : "/api/templates", { method: editingTemplate ? "PATCH" : "POST", body: JSON.stringify(templateDraft) });
      setTemplateOpen(false); setSuccess(editingTemplate ? "Modelo atualizado." : "Modelo criado."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar o modelo."); }
    finally { setBusy(false); }
  }

  async function deleteTemplate(template: Template) {
    if (!window.confirm(`Excluir o modelo “${template.title}”? Os documentos já gerados serão mantidos.`)) return;
    setBusy(true); setError("");
    try { await api(`/api/templates/${template.id}`, { method: "DELETE" }); setTemplateOpen(false); setSuccess("Modelo excluído."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível excluir o modelo."); }
    finally { setBusy(false); }
  }

  async function share(document: DocumentRecord) {
    setError("");
    try { await sharePdf(`/api/documents/${document.id}/pdf`, `${document.title}.pdf`); }
    catch (cause) { if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "Não foi possível compartilhar o PDF."); }
  }

  return <div className="page">
    <PageHeader eyebrow="Tudo ao seu alcance" title="Documentos" description="Cuidado que continua depois da consulta." action={<Button onClick={() => openDocument()}><Plus size={18} /> Novo documento</Button>} />
    {error && !documentOpen && !templateOpen && <Notice kind="error">{error}</Notice>}
    {success && <Notice kind="success">{success}</Notice>}
    {loading ? <Spinner /> : <div className="stack">
      <section className="card">
        <div className="card-header"><div><h2>Seus modelos</h2><p className="muted">Personalize uma vez. Reutilize sempre que precisar.</p></div><Button variant="ghost" size="sm" onClick={() => openTemplate()}><Plus size={16} /> Criar modelo</Button></div>
        {templates.length ? <div className="template-list">{templates.map((template) => <article key={template.id} className="template-item">
          <div className="template-icon"><FilePenLine size={23} /></div><div className="stack compact"><span className="tag">{kindLabel(template.kind)}</span><h3>{template.title}</h3><p className="muted line-clamp-2">{template.content}</p></div>
          <div className="actions"><Button variant="secondary" size="sm" onClick={() => openDocument(template)}>Usar modelo</Button><Button variant="ghost" size="sm" onClick={() => openTemplate(template)} aria-label={`Editar modelo ${template.title}`}><FilePenLine size={16} /></Button></div>
        </article>)}</div> : <EmptyState icon={<WandSparkles size={26} />} title="Seu jeito de orientar" description="Crie modelos de receituário e de recomendações pós-operatórias para agilizar sua rotina." action={<Button variant="secondary" onClick={() => openTemplate()}>Criar primeiro modelo</Button>} />}
      </section>
      <section className="card">
        <div className="card-header"><div><h2>Documentos gerados <span className="count">{documents.length}</span></h2><p className="muted">Com a identificação do seu perfil profissional.</p></div><input className="input search-input" type="search" placeholder="Buscar documento ou paciente" aria-label="Buscar documentos" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        {filtered.length ? <div className="document-list">{filtered.map((document) => <article key={document.id} className="document-item">
          <div className="document-icon"><FileText size={22} /></div><div className="document-info"><h3>{document.title}</h3><p className="muted">{document.patient_name || patients.find((patient) => patient.id === document.patient_id)?.name || "Sem paciente vinculado"} · {new Date(document.created_at).toLocaleDateString("pt-BR")}</p><span className="tag">{kindLabel(document.kind)}</span></div>
          <div className="actions"><a className="button button-secondary button-sm" href={`/api/documents/${document.id}/pdf`} download><Download size={16} /><span>PDF</span></a><Button variant="ghost" size="sm" onClick={() => void share(document)} aria-label={`Compartilhar ${document.title}`}><Share2 size={18} /></Button></div>
        </article>)}</div> : <EmptyState icon={<FileText size={28} />} title={query ? "Nenhum documento encontrado" : "Uma orientação faz a diferença"} description={query ? "Tente outro nome ou título." : "Crie um receituário ou uma recomendação e compartilhe o PDF com seu paciente."} action={!query ? <Button variant="secondary" onClick={() => openDocument()}>Criar documento</Button> : undefined} />}
      </section>
    </div>}
    {documentOpen && <Modal title="Novo documento" onClose={() => { if (!busy) setDocumentOpen(false); }}><form className="stack" onSubmit={saveDocument}>
      {error && <Notice kind="error">{error}</Notice>}
      <Field label="Modelo"><select className="select" value={draft.template_id} onChange={(event) => chooseTemplate(event.target.value)}><option value="">Começar em branco</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}</select></Field>
      <div className="form-grid"><Field label="Tipo"><select className="select" value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as Kind })}><option value="prescription">Receituário</option><option value="post_op">Recomendações pós-operatórias</option></select></Field><Field label="Paciente (opcional)"><select className="select" value={draft.patient_id} onChange={(event) => setDraft({ ...draft, patient_id: event.target.value })}><option value="">Sem paciente vinculado</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}</select></Field></div>
      <Field label="Título"><input className="input" required maxLength={200} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Ex.: Recomendações após o tratamento" /></Field>
      <Field label="Conteúdo" hint="Revise as informações antes de gerar o documento. Seu cabeçalho profissional será incluído automaticamente."><textarea className="textarea" rows={11} required maxLength={20000} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} placeholder="Escreva as orientações ou a prescrição…" /></Field>
      <div className="actions modal-actions"><Button variant="secondary" type="button" disabled={busy} onClick={() => setDocumentOpen(false)}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar documento"}</Button></div>
    </form></Modal>}
    {templateOpen && <Modal title={editingTemplate ? "Editar modelo" : "Novo modelo"} onClose={() => { if (!busy) setTemplateOpen(false); }}><form className="stack" onSubmit={saveTemplate}>
      {error && <Notice kind="error">{error}</Notice>}
      <Field label="Nome do modelo"><input className="input" required maxLength={200} value={templateDraft.title} onChange={(event) => setTemplateDraft({ ...templateDraft, title: event.target.value })} placeholder="Ex.: Cuidados pós-operatórios" /></Field>
      <Field label="Tipo"><select className="select" value={templateDraft.kind} onChange={(event) => setTemplateDraft({ ...templateDraft, kind: event.target.value as Kind })}><option value="prescription">Receituário</option><option value="post_op">Recomendações pós-operatórias</option></select></Field>
      <Field label="Conteúdo do modelo" hint="Use {{paciente}} para inserir o nome do paciente ao gerar o documento."><textarea className="textarea" rows={10} required maxLength={20000} value={templateDraft.content} onChange={(event) => setTemplateDraft({ ...templateDraft, content: event.target.value })} /></Field>
      <div className="actions modal-actions">{editingTemplate && <Button variant="danger" type="button" disabled={busy} onClick={() => void deleteTemplate(editingTemplate)}><Trash2 size={16} /> Excluir</Button>}<Button variant="secondary" type="button" disabled={busy} onClick={() => setTemplateOpen(false)}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar modelo"}</Button></div>
    </form></Modal>}
  </div>;
}
