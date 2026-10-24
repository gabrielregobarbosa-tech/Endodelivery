import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import { buildClinicalReport, buildDocumentPdf, pdfSafeText } from "@/lib/pdf";

test("relatório inclui páginas de radiografias e aceita acentos clínicos", async () => {
  const image = await sharp({ create: { width: 160, height: 200, channels: 3, background: "#a3a3a3" } }).jpeg().toBuffer();
  const report = await buildClinicalReport({
    profile: { name: "Dra. Profissional Fictícia", specialty: "Endodontia", cro: "EXEMPLO-000", email: "ficticio@example.test" },
    patient: { name: "Paciente de Teste", referring_professional: "Dentista Fictício", birth_date: "1990-05-12" },
    visits: [{ attended_at: "2026-10-24", tooth: "36", treatment: "Tratamento endodôntico", cement: "Cimento fictício", irrigant: "Irrigante fictício", notes: "Observação com acentuação e símbolo 🦷.", canals: [{ name: "MV", odontometry: "20 mm", laf: "#25" }] }],
    radiographs: [{ image, caption: "Radiografia fictícia de teste", created_at: "2026-10-24T10:00:00Z" }],
  });
  assert.equal(Buffer.from(report).subarray(0, 5).toString(), "%PDF-");
  const loaded = await PDFDocument.load(report);
  assert.equal(loaded.getTitle(), "Relatório endodôntico");
  assert.equal(loaded.getPageCount(), 2);
  assert.ok(loaded.getPages()[1].node.Resources()?.get);
});

test("documento pagina conteúdo longo sem descartar parágrafos ou falhar com palavras extensas", async () => {
  const result = await buildDocumentPdf({
    profile: { name: "Profissional de Teste", address: "Endereço fictício" },
    patient: { name: "Paciente fictício" },
    title: "Recomendações pós-operatórias",
    content: `${"Orientação fictícia para testar paginação. ".repeat(1000)}\n${"x".repeat(1500)}`,
    created_at: "2026-10-24T09:30:00Z",
  });
  const loaded = await PDFDocument.load(result);
  assert.ok(loaded.getPageCount() > 4);
  assert.ok(result.byteLength > 5000);
});

test("PDF preserva pt-BR e substitui caracteres fora da codificação com segurança", async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  assert.equal(pdfSafeText("Odontometria, irrigação e observações — 🦷", font), "Odontometria, irrigação e observações - ?");
});
