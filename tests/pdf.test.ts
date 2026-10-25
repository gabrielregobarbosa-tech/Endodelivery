import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import fontkit from "@pdf-lib/fontkit";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import sharp from "sharp";
import { buildClinicalReport, buildDocumentPdf, pdfResponse, pdfSafeText } from "@/lib/pdf";

/** Read text from the saved document's font maps and content, independently of the PDF writer. */
async function extractedLines(bytes: Uint8Array): Promise<string[]> {
  const document = await PDFDocument.load(bytes);
  const lines: string[] = [];
  function rawStream(reference: ReturnType<PDFDict["get"]>): PDFRawStream {
    const object = document.context.lookup(reference);
    assert.ok(object instanceof PDFRawStream, "PDF content must be a readable saved stream.");
    return object;
  }
  for (const page of document.getPages()) {
    const dictionaries = page.node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
    const fonts = new Map<string, Map<string, string>>();
    for (const [name, reference] of dictionaries.entries()) {
      const dictionary = document.context.lookup(reference, PDFDict);
      const stream = rawStream(dictionary.get(PDFName.of("ToUnicode")));
      const cmap = new TextDecoder().decode(decodePDFRawStream(stream).decode());
      const characters = new Map<string, string>();
      for (const section of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
        for (const pair of section[1].matchAll(/<([0-9A-F]+)>\s*<([0-9A-F]+)>/gi)) {
          const units = pair[2].match(/.{4}/g)!.map((unit) => parseInt(unit, 16));
          characters.set(pair[1].toUpperCase(), String.fromCharCode(...units));
        }
      }
      fonts.set(name.decodeText(), characters);
    }
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray
      ? Array.from({ length: contents.size() }, (_, index) => rawStream(contents.get(index)))
      : [rawStream(contents)];
    for (const stream of streams) {
      const source = new TextDecoder().decode(decodePDFRawStream(stream).decode());
      for (const text of source.matchAll(/BT([\s\S]*?)ET/g)) {
        const fontName = /\/([^\s]+)\s+[\d.]+\s+Tf/.exec(text[1])?.[1];
        assert.ok(fontName && fonts.has(fontName), "The saved text must reference an embedded Unicode font.");
        const characters = fonts.get(fontName)!;
        for (const token of text[1].matchAll(/<([0-9A-F]+)>\s*Tj/gi)) {
          lines.push(token[1].match(/.{4}/g)!.map((glyph) => {
            const character = characters.get(glyph.toUpperCase());
            assert.notEqual(character, undefined, `Every saved glyph must have a Unicode text mapping (${fontName}: ${glyph}).`);
            return character;
          }).join(""));
        }
      }
    }
  }
  return lines;
}

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

test("PDF preserva pontuação e diacríticos sem normalizar a grafia", async () => {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(await readFile("lib/fonts/DejaVuSans.ttf"), { subset: true });
  assert.equal(pdfSafeText("Drª. Ana-Maria D’Ávila — Joa\u0303o", font, true), "Drª. Ana-Maria D’Ávila — Joa\u0303o");
  assert.equal(pdfSafeText("Observação com símbolo 🦷", font), "Observação com símbolo [U+1F9B7]");
});

test("PDF serializado reproduz nomes profissionais completos e Unicode no texto renderizado", async () => {
  for (const name of ["Gabriel Barbosa", "Dr. Gabriel Barbosa", "Dr. Gabriel R. Barbosa", "Drª. Ana Maria", "João D'Ávila", "Drª. Ana-Maria D’Ávila", "Dr. Joa\u0303o D'A\u0301vila", "Dr. Мария Иванова", "Dr. Άννα Παππά", "Dr. 李 明", "Dr. 山田 太郎", "Dr. 김 민수"]) {
    const bytes = await buildDocumentPdf({
      profile: { name }, patient: { name: "Paciente Fictício" }, title: "Documento fictício",
      content: "Conteúdo exclusivamente fictício para verificar a exportação.", created_at: "2026-10-24T09:30:00Z",
    });
    const saved = await PDFDocument.load(bytes);
    assert.ok(bytes.byteLength < 4 * 1024 * 1024, "Font subsets must fit the production response limit for a small document.");
    assert.equal(saved.getAuthor(), name);
    assert.ok((await extractedLines(bytes)).includes(name), `O nome precisa aparecer integralmente no documento: ${name}`);
  }
});

test("nome longo é preservado no cabeçalho sem truncamento", async () => {
  const name = "W".repeat(120);
  const bytes = await buildClinicalReport({ profile: { name }, patient: { name: "Paciente Fictício" }, visits: [], radiographs: [] });
  assert.ok((await extractedLines(bytes)).join("").includes(name));
});

test("documento escolhe a fonte de cada parágrafo sem corromper alfabetos diferentes", async () => {
  const names = ["Dr. Joa\u0303o D'A\u0301vila", "Dr. 李 明", "Dr. 山田 太郎", "Dr. 김 민수"];
  const bytes = await buildDocumentPdf({
    profile: { name: "Dr. 李 明" }, title: "Documento fictício", content: names.join("\n"), created_at: "2026-10-24T09:30:00Z",
  });
  const lines = await extractedLines(bytes);
  for (const name of names) assert.ok(lines.includes(name), `O parágrafo deve manter a grafia: ${name}`);
});

test("glifo de nome indisponível produz erro explícito em vez de substituir a identidade", async () => {
  await assert.rejects(buildDocumentPdf({
    profile: { name: "Dr. अमित" }, title: "Documento fictício", content: "Dados fictícios.", created_at: "2026-10-24T09:30:00Z",
  }), (error: unknown) => error instanceof Error && "status" in error && error.status === 422);
});

test("PDF grande falha de forma clara antes do limite de resposta da Vercel", () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = "1";
  try {
    assert.throws(() => pdfResponse(new Uint8Array(4 * 1024 * 1024 + 1), "ficticio.pdf"), (error: unknown) => error instanceof Error && "status" in error && error.status === 413);
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});
