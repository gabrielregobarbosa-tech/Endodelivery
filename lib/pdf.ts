import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";

export interface PdfProfile {
  name: string; specialty?: string; cro?: string; phone?: string; email?: string;
  address?: string; logo_data_url?: string;
}
export interface PdfPatient {
  name: string; birth_date?: string; phone?: string; referring_professional?: string;
}
export interface PdfVisit {
  attended_at: string; tooth: string; treatment: string; cement: string; irrigant: string;
  notes: string; canals: { name: string; odontometry: string; laf: string; notes?: string }[];
}
export interface PdfRadiograph { image: Buffer; caption: string; created_at: string }

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const navy = rgb(0.09, 0.19, 0.24);
const muted = rgb(0.37, 0.44, 0.47);
const teal = rgb(0.02, 0.47, 0.44);

/** PDFs padrões usam WinAnsi; preservamos acentos pt-BR e substituímos apenas glifos incompatíveis. */
export function pdfSafeText(value: unknown, font: PDFFont): string {
  const text = String(value ?? "").normalize("NFC")
    .replace(/[\u2010-\u2015]/g, "-").replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"').replace(/\u2022/g, "-")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  return [...text].map((character) => {
    if (character === "\n" || character === "\r" || character === "\t") return character;
    try { font.encodeText(character); return character; } catch { return "?"; }
  }).join("");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    if (!paragraph.trim()) { lines.push(""); continue; }
    let line = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue; }
      if (line) lines.push(line);
      line = "";
      for (const character of word) {
        if (font.widthOfTextAtSize(line + character, size) > width && line) {
          lines.push(line); line = "";
        }
        line += character;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

class ClinicalPdf {
  private page!: PDFPage;
  private y = 0;
  private logo?: PDFImage;
  private constructor(
    readonly document: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
    readonly profile: PdfProfile,
  ) {}

  static async create(profile: PdfProfile): Promise<ClinicalPdf> {
    const document = await PDFDocument.create();
    document.setCreator("EndoDelivery");
    document.setProducer("EndoDelivery");
    const regular = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    const builder = new ClinicalPdf(document, regular, bold, profile);
    const logo = profile.logo_data_url;
    if (logo && logo.length <= 1_500_000) {
      const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=\s]+)$/.exec(logo);
      if (match) {
        try {
          const bytes = Buffer.from(match[2], "base64");
          builder.logo = match[1] === "png" ? await document.embedPng(bytes) : await document.embedJpg(bytes);
        } catch { /* Uma logo inválida nunca impede a exportação das informações clínicas. */ }
      }
    }
    builder.newPage();
    return builder;
  }

  private draw(text: string, x: number, y: number, size = 10, bold = false, color = navy) {
    const font = bold ? this.bold : this.regular;
    this.page.drawText(pdfSafeText(text, font), { x, y, size, font, color });
  }

  newPage() {
    this.page = this.document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let headerX = MARGIN;
    let headerWidth = CONTENT_WIDTH;
    if (this.logo) {
      const dimensions = this.logo.scaleToFit(48, 48);
      this.page.drawImage(this.logo, { x: MARGIN, y: PAGE_HEIGHT - 89 + (48 - dimensions.height) / 2, ...dimensions });
      headerX += 62; headerWidth -= 62;
    }
    const names = wrap(pdfSafeText(this.profile.name || "Profissional responsável", this.bold), this.bold, 15, headerWidth);
    let headerY = PAGE_HEIGHT - 54;
    for (const line of names.slice(0, 2)) { this.draw(line, headerX, headerY, 15, true); headerY -= 18; }
    const credentials = [this.profile.specialty, this.profile.cro ? `CRO ${this.profile.cro}` : ""].filter(Boolean).join("  |  ");
    if (credentials) {
      for (const line of wrap(pdfSafeText(credentials, this.regular), this.regular, 9, headerWidth).slice(0, 2)) {
        this.draw(line, headerX, headerY, 9, false, muted); headerY -= 12;
      }
    }
    const contact = [this.profile.phone, this.profile.email].filter(Boolean).join("  |  ");
    if (contact) {
      for (const line of wrap(pdfSafeText(contact, this.regular), this.regular, 8, headerWidth).slice(0, 2)) {
        this.draw(line, headerX, headerY, 8, false, muted); headerY -= 11;
      }
    }
    if (this.profile.address) {
      for (const line of wrap(pdfSafeText(this.profile.address, this.regular), this.regular, 8, headerWidth).slice(0, 2)) {
        this.draw(line, headerX, headerY, 8, false, muted); headerY -= 11;
      }
    }
    this.y = Math.min(headerY - 22, PAGE_HEIGHT - 127);
    this.page.drawLine({ start: { x: MARGIN, y: this.y + 9 }, end: { x: PAGE_WIDTH - MARGIN, y: this.y + 9 }, color: teal, thickness: 1.4 });
  }

  private ensure(height: number) { if (this.y - height < 63) this.newPage(); }

  paragraph(value: unknown, options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {}) {
    const size = options.size ?? 10;
    const font = options.bold ? this.bold : this.regular;
    const text = pdfSafeText(value, font).replace(/\t/g, "    ");
    const lines = wrap(text, font, size, CONTENT_WIDTH);
    const lineHeight = size * 1.45;
    for (const line of lines) {
      this.ensure(lineHeight);
      this.draw(line, MARGIN, this.y, size, options.bold, options.color);
      this.y -= lineHeight;
    }
    this.y -= options.gap ?? 5;
  }

  title(title: string) {
    this.ensure(48);
    this.paragraph(title, { size: 19, bold: true, color: teal, gap: 12 });
  }

  heading(title: string) {
    this.ensure(50);
    this.y -= 9;
    this.paragraph(title, { size: 12, bold: true, gap: 7 });
  }

  field(label: string, value: unknown) {
    if (String(value ?? "").trim()) this.paragraph(`${label}: ${String(value)}`);
  }

  patient(patient: PdfPatient) {
    this.field("Paciente", patient.name);
    this.field("Nascimento", formatDate(patient.birth_date));
    this.field("Contato", patient.phone);
    this.field("Profissional indicador", patient.referring_professional);
    this.y -= 8;
  }

  async radiograph(image: PdfRadiograph, index: number) {
    this.newPage();
    this.heading(`Radiografia ${index + 1}`);
    this.field("Registro", formatDate(image.created_at.slice(0, 10)));
    this.paragraph(image.caption || "Sem legenda", { gap: 12 });
    const embedded = await this.document.embedJpg(image.image);
    const availableHeight = Math.min(this.y - 77, 550);
    if (availableHeight < 80) this.newPage();
    const dimensions = embedded.scaleToFit(CONTENT_WIDTH, Math.min(this.y - 77, 550));
    this.page.drawImage(embedded, {
      x: MARGIN + (CONTENT_WIDTH - dimensions.width) / 2,
      y: this.y - dimensions.height,
      ...dimensions,
    });
    this.y -= dimensions.height + 18;
  }

  async save(): Promise<Uint8Array> {
    const pages = this.document.getPages();
    pages.forEach((page, index) => {
      page.drawLine({ start: { x: MARGIN, y: 47 }, end: { x: PAGE_WIDTH - MARGIN, y: 47 }, color: rgb(0.85, 0.88, 0.88), thickness: 0.5 });
      page.drawText("Documento clínico confidencial", { x: MARGIN, y: 32, size: 8, font: this.regular, color: muted });
      const count = `${index + 1} / ${pages.length}`;
      page.drawText(count, { x: PAGE_WIDTH - MARGIN - this.regular.widthOfTextAtSize(count, 8), y: 32, size: 8, font: this.regular, color: muted });
    });
    return this.document.save();
  }
}

function formatDate(date?: string): string {
  if (!date) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
}

export async function buildClinicalReport(input: {
  profile: PdfProfile; patient: PdfPatient; visits: PdfVisit[]; radiographs: PdfRadiograph[];
}): Promise<Uint8Array> {
  const pdf = await ClinicalPdf.create(input.profile);
  pdf.document.setTitle("Relatório endodôntico");
  pdf.title("Relatório endodôntico");
  pdf.patient(input.patient);
  if (!input.visits.length) pdf.paragraph("Nenhum atendimento registrado até a emissão deste relatório.");
  for (const [index, visit] of input.visits.entries()) {
    pdf.heading(`Atendimento ${index + 1} - ${formatDate(visit.attended_at)}`);
    pdf.field("Elemento dentário", visit.tooth);
    pdf.field("Tratamento realizado", visit.treatment);
    if (visit.canals.length) {
      pdf.paragraph("Odontometria e LAF por canal", { bold: true });
      visit.canals.forEach((canal) => {
        pdf.paragraph(`${canal.name || "Canal"}  |  Odontometria: ${canal.odontometry || "não informada"}  |  LAF: ${canal.laf || "não informado"}`);
        if (canal.notes) pdf.field("Observações do canal", canal.notes);
      });
    }
    pdf.field("Cimento utilizado", visit.cement);
    pdf.field("Irrigante", visit.irrigant);
    pdf.field("Observações", visit.notes);
  }
  for (const [index, image] of input.radiographs.entries()) await pdf.radiograph(image, index);
  return pdf.save();
}

export async function buildDocumentPdf(input: {
  profile: PdfProfile; patient?: PdfPatient; title: string; content: string; created_at: string;
}): Promise<Uint8Array> {
  const pdf = await ClinicalPdf.create(input.profile);
  pdf.document.setTitle(pdfSafeText(input.title, pdf.regular));
  pdf.title(input.title);
  if (input.patient) pdf.patient(input.patient);
  pdf.field("Data de emissão", formatDate(input.created_at.slice(0, 10)));
  pdf.paragraph("");
  pdf.paragraph(input.content, { size: 11 });
  pdf.paragraph("");
  pdf.paragraph(input.profile.name, { bold: true });
  if (input.profile.cro) pdf.paragraph(`CRO ${input.profile.cro}`, { size: 9 });
  return pdf.save();
}

export function pdfResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(new Uint8Array(bytes), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  } });
}
