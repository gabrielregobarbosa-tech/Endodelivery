import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import subsetFont from "subset-font";
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from "pdf-lib";
import { HttpError } from "@/lib/http";

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
const teal = rgb(20 / 255, 94 / 255, 88 / 255);
const fontCharacters = new WeakMap<PDFFont, Set<number>>();
const fontWidths = new WeakMap<PDFFont, Map<string, number>>();
let fonts: Promise<[Buffer, Buffer]> | undefined;
let cjkFont: Promise<Buffer> | undefined;
const containsCjk = /[\u2e80-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af\u{20000}-\u{3134f}]/u;

function fontFiles(): Promise<[Buffer, Buffer]> {
  fonts ??= Promise.all([
    readFile(resolve(process.cwd(), "lib/fonts/DejaVuSans.ttf")),
    readFile(resolve(process.cwd(), "lib/fonts/DejaVuSans-Bold.ttf")),
  ]);
  return fonts;
}

function textWidth(font: PDFFont, text: string, size: number): number {
  let widths = fontWidths.get(font);
  if (!widths) { widths = new Map(); fontWidths.set(font, widths); }
  const key = `${size}\u0000${text}`;
  const cached = widths.get(key);
  if (cached !== undefined) return cached;
  const width = font.widthOfTextAtSize(text, size);
  if (widths.size < 5000) widths.set(key, width);
  return width;
}

function characterSet(font: PDFFont): Set<number> {
  let characters = fontCharacters.get(font);
  if (!characters) { characters = new Set(font.getCharacterSet()); fontCharacters.set(font, characters); }
  return characters;
}

function supportsText(font: PDFFont, text: string): boolean {
  const characters = characterSet(font);
  return [...text].every((character) => /[\r\n\t]/.test(character) || characters.has(character.codePointAt(0)!));
}

/** Keep identity text verbatim; unsupported free-text symbols retain their Unicode code point. */
export function pdfSafeText(value: unknown, font: PDFFont, strictIdentity = false): string {
  const original = String(value ?? "");
  if (strictIdentity && /[\u0000-\u001f\u007f-\u009f]/.test(original)) {
    throw new HttpError(422, "Um dos nomes contém um caractere de controle inválido. O cadastro foi preservado; revise o nome antes de exportar.");
  }
  const text = original.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "");
  const characters = characterSet(font);
  return [...text].map((character) => {
    if (character === "\n" || character === "\r" || character === "\t") return character;
    if (characters.has(character.codePointAt(0)!)) return character;
    if (strictIdentity) {
      throw new HttpError(422, "Um dos nomes contém um caractere ainda não suportado pela fonte do PDF. O cadastro foi preservado; solicite suporte para exportá-lo sem alterar a grafia.");
    }
    return `[U+${character.codePointAt(0)!.toString(16).toUpperCase()}]`;
  }).join("");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    if (!paragraph) { lines.push(""); continue; }
    let line = "";
    for (const word of paragraph.match(/\s+|\S+/g) ?? []) {
      const candidate = line + word;
      if (textWidth(font, candidate, size) <= width) { line = candidate; continue; }
      if (line) lines.push(line);
      line = "";
      for (const character of word) {
        if (textWidth(font, line + character, size) > width && line) {
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
    readonly cjk?: PDFFont,
  ) {}

  static async create(profile: PdfProfile, textInputs: unknown[] = []): Promise<ClinicalPdf> {
    const document = await PDFDocument.create();
    document.setCreator("EndoDelivery");
    document.setProducer("EndoDelivery");
    document.setAuthor(profile.name);
    document.registerFontkit(fontkit);
    const [regularBytes, boldBytes] = await fontFiles();
    const regular = await document.embedFont(regularBytes, { subset: true });
    const bold = await document.embedFont(boldBytes, { subset: true });
    let cjk: PDFFont | undefined;
    const inputs = [profile.name, profile.specialty, profile.cro, profile.phone, profile.email, profile.address, ...textInputs];
    if (inputs.some((value) => containsCjk.test(String(value ?? "")))) {
      cjkFont ??= readFile(resolve(process.cwd(), "lib/fonts/NotoSansKR.ttf"));
      const boilerplate = Array.from({ length: 224 }, (_, index) => String.fromCodePoint(index + 32)).join("");
      const characters = [...new Set([...boilerplate, ...inputs.map((value) => String(value ?? "")).join("\n")])].join("");
      // Fontkit's own CJK subsetter loses outlines; HarfBuzz produces a complete, regular TrueType subset.
      const bytes = await subsetFont(await cjkFont, characters, {
        targetFormat: "sfnt", variationAxes: { wght: 400 }, preserveNameIds: [0, 13, 14], keepFeatures: [],
      });
      cjk = await document.embedFont(bytes, { subset: false });
    }
    const builder = new ClinicalPdf(document, regular, bold, profile, cjk);
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

  private fontFor(text: string, bold = false): PDFFont {
    const primary = bold ? this.bold : this.regular;
    return !supportsText(primary, text) && this.cjk && (containsCjk.test(text) || supportsText(this.cjk, text)) ? this.cjk : primary;
  }

  private draw(text: string, x: number, y: number, size = 10, bold = false, color = navy, selectedFont?: PDFFont) {
    const font = selectedFont ?? this.fontFor(text, bold);
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
    const name = this.profile.name || "Profissional responsável";
    const nameFont = this.fontFor(name, true);
    const names = wrap(pdfSafeText(name, nameFont, true), nameFont, 15, headerWidth);
    let headerY = PAGE_HEIGHT - 54;
    for (const line of names) { this.draw(line, headerX, headerY, 15, true, navy, nameFont); headerY -= 18; }
    const credentials = [this.profile.specialty, this.profile.cro ? `CRO ${this.profile.cro}` : ""].filter(Boolean).join("  |  ");
    if (credentials) {
      const font = this.fontFor(credentials);
      for (const line of wrap(pdfSafeText(credentials, font), font, 9, headerWidth).slice(0, 2)) {
        this.draw(line, headerX, headerY, 9, false, muted); headerY -= 12;
      }
    }
    const contact = [this.profile.phone, this.profile.email].filter(Boolean).join("  |  ");
    if (contact) {
      const font = this.fontFor(contact);
      for (const line of wrap(pdfSafeText(contact, font), font, 8, headerWidth).slice(0, 2)) {
        this.draw(line, headerX, headerY, 8, false, muted); headerY -= 11;
      }
    }
    if (this.profile.address) {
      const font = this.fontFor(this.profile.address);
      for (const line of wrap(pdfSafeText(this.profile.address, font), font, 8, headerWidth).slice(0, 2)) {
        this.draw(line, headerX, headerY, 8, false, muted); headerY -= 11;
      }
    }
    this.y = Math.min(headerY - 22, PAGE_HEIGHT - 127);
    this.page.drawLine({ start: { x: MARGIN, y: this.y + 9 }, end: { x: PAGE_WIDTH - MARGIN, y: this.y + 9 }, color: teal, thickness: 1.4 });
    this.y -= 20;
  }

  private ensure(height: number) { if (this.y - height < 63) this.newPage(); }

  paragraph(value: unknown, options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number; strictIdentity?: boolean } = {}) {
    const size = options.size ?? 10;
    const lineHeight = size * 1.45;
    for (const paragraph of String(value ?? "").replace(/\r/g, "").split("\n")) {
      const font = this.fontFor(paragraph, options.bold);
      const text = pdfSafeText(paragraph, font, options.strictIdentity).replace(/\t/g, "    ");
      for (const line of wrap(text, font, size, CONTENT_WIDTH)) {
        this.ensure(lineHeight);
        this.draw(line, MARGIN, this.y, size, options.bold, options.color, font);
        this.y -= lineHeight;
      }
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

  field(label: string, value: unknown, strictIdentity = false) {
    if (String(value ?? "").trim()) this.paragraph(`${label}: ${String(value)}`, { strictIdentity });
  }

  patient(patient: PdfPatient) {
    this.field("Paciente", patient.name, true);
    this.field("Nascimento", formatDate(patient.birth_date));
    this.field("Contato", patient.phone);
    this.field("Profissional indicador", patient.referring_professional, true);
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
  const pdf = await ClinicalPdf.create(input.profile, [
    ...Object.values(input.patient),
    ...input.visits.flatMap((visit) => [
      visit.treatment, visit.cement, visit.irrigant, visit.notes,
      ...visit.canals.flatMap((canal) => Object.values(canal)),
    ]),
    ...input.radiographs.map((image) => image.caption),
  ]);
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
  const pdf = await ClinicalPdf.create(input.profile, [input.title, input.content, ...Object.values(input.patient ?? {})]);
  pdf.document.setTitle(input.title);
  pdf.title(input.title);
  if (input.patient) pdf.patient(input.patient);
  pdf.field("Data de emissão", formatDate(input.created_at.slice(0, 10)));
  pdf.paragraph("");
  pdf.paragraph(input.content, { size: 11 });
  pdf.paragraph("");
  pdf.paragraph(input.profile.name, { bold: true, strictIdentity: true });
  if (input.profile.cro) pdf.paragraph(`CRO ${input.profile.cro}`, { size: 9 });
  return pdf.save();
}

export function pdfResponse(bytes: Uint8Array, filename: string): Response {
  if (process.env.VERCEL === "1" && bytes.byteLength > 4 * 1024 * 1024) {
    throw new HttpError(413, "O PDF excede o limite de exportação deste ambiente. As informações e radiografias foram preservadas; solicite suporte para exportar o arquivo completo.");
  }
  return new Response(new Uint8Array(bytes), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  } });
}
