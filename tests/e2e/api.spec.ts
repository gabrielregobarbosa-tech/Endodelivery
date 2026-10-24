import { randomUUID } from "node:crypto";
import { expect, request as requestFactory, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100";
const password = "Senha-ficticia-API-123!";

interface Account {
  context: APIRequestContext;
  email: string;
  id: string;
  name: string;
}

async function newContext(): Promise<APIRequestContext> {
  return requestFactory.newContext({
    baseURL,
    // Simulate a trusted proxy's isolated client identifier. Never use real patient data.
    extraHTTPHeaders: { "x-forwarded-for": `e2e-${randomUUID()}` },
  });
}

async function expectStatus(response: APIResponse, expected: number): Promise<void> {
  expect(response.status(), `${response.url()} returned: ${await response.text()}`).toBe(expected);
}

async function createAccount(name: string): Promise<Account> {
  const context = await newContext();
  const email = `test-${randomUUID()}@endodelivery.example`;
  const response = await context.post("/api/auth/register", { data: { name, email, password } });
  await expectStatus(response, 201);
  const { user } = await response.json();
  expect(user).toMatchObject({ name, email });
  expect(user.password_hash).toBeUndefined();
  return { context, email, id: user.id, name };
}

async function createPatient(context: APIRequestContext, name = "Paciente fictício API") {
  const response = await context.post("/api/patients", {
    data: {
      name,
      referring_professional: "Profissional fictício",
      birth_date: "1990-05-14",
      phone: "0000000000",
      notes: "Registro exclusivamente fictício para testes automatizados.",
    },
  });
  await expectStatus(response, 201);
  return (await response.json()).patient;
}

async function pngImage(): Promise<Buffer> {
  return sharp({ create: { width: 96, height: 64, channels: 3, background: "#98a8b8" } }).png().toBuffer();
}

async function verifyPdf(response: APIResponse, minimumPages = 1): Promise<void> {
  await expectStatus(response, 200);
  expect(response.headers()["content-type"]).toContain("application/pdf");
  expect(response.headers()["cache-control"]).toContain("no-store");
  const bytes = await response.body();
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(minimumPages);
}

test("authentication validates credentials, protects sessions and rejects cross-site mutations", async () => {
  const anonymous = await newContext();
  const account = await createAccount("Profissional fictício de autenticação");
  try {
    const health = await anonymous.get("/api/health");
    await expectStatus(health, 200);
    expect(await health.json()).toEqual({ status: "ok", database: "ready" });
    await expectStatus(await anonymous.get("/api/patients"), 401);
    await expectStatus(await anonymous.get("/api/profile"), 401);
    await expectStatus(await anonymous.get("/api/auth/me"), 401);
    await expectStatus(await anonymous.post("/api/auth/register", {
      data: { name: "Teste", email: `weak-${randomUUID()}@endodelivery.example`, password: "curta" },
    }), 400);
    await expectStatus(await anonymous.post("/api/auth/register", {
      headers: { origin: "https://untrusted.example", "sec-fetch-site": "cross-site" },
      data: { name: "Teste", email: `csrf-${randomUUID()}@endodelivery.example`, password },
    }), 403);

    const cookie = (await account.context.storageState()).cookies.find((item) => item.name === "endodelivery_session");
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const me = await account.context.get("/api/auth/me");
    await expectStatus(me, 200);
    expect((await me.json()).user).toEqual({ id: account.id, name: account.name, email: account.email });

    await expectStatus(await account.context.post("/api/auth/logout", { headers: { origin: "https://untrusted.example" } }), 403);
    await expectStatus(await account.context.get("/api/auth/me"), 200);
    await expectStatus(await account.context.post("/api/auth/logout"), 200);
    await expectStatus(await account.context.get("/api/auth/me"), 401);

    const wrongPassword = await anonymous.post("/api/auth/login", { data: { email: account.email, password: "Senha-incorreta-123!" } });
    const nonexistent = await anonymous.post("/api/auth/login", { data: { email: `missing-${randomUUID()}@endodelivery.example`, password } });
    await expectStatus(wrongPassword, 401);
    await expectStatus(nonexistent, 401);
    expect(await wrongPassword.json()).toEqual(await nonexistent.json());

    const login = await account.context.post("/api/auth/login", { data: { email: account.email.toUpperCase(), password } });
    await expectStatus(login, 200);
    expect((await login.json()).user.id).toBe(account.id);
    await expectStatus(await account.context.get("/api/auth/me"), 200);
  } finally {
    await anonymous.dispose();
    await account.context.dispose();
  }
});

test("clinical records, agenda, images and customized PDFs persist across authenticated sessions", async () => {
  const account = await createAccount("Profissional fictício do fluxo clínico");
  const context = account.context;
  let resumed: APIRequestContext | undefined;
  try {
    const image = await pngImage();
    const profileResponse = await context.put("/api/profile", {
      data: {
        name: "Dra. Fictícia de Teste", specialty: "Endodontia", cro: "AM-TESTE-000",
        email: account.email, phone: "0000000000", address: "Endereço fictício de teste",
        logo_data_url: `data:image/png;base64,${image.toString("base64")}`,
      },
    });
    await expectStatus(profileResponse, 200);
    expect((await profileResponse.json()).profile.logo_data_url).toMatch(/^data:image\/png;base64,/);
    await expectStatus(await context.put("/api/profile", {
      data: { name: "Teste", logo_data_url: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" },
    }), 400);

    const patient = await createPatient(context);
    await expectStatus(await context.patch(`/api/patients/${patient.id}`, { data: { notes: "Anotação clínica fictícia atualizada." } }), 200);
    const search = await context.get("/api/patients?q=Paciente%20fict%C3%ADcio");
    await expectStatus(search, 200);
    expect((await search.json()).patients.map((item: { id: string }) => item.id)).toContain(patient.id);

    const canals = Array.from({ length: 16 }, (_, index) => ({ name: `Canal ${index + 1}`, odontometry: `${20 + index / 10} mm`, laf: `LAF ${index + 1}` }));
    const visitInput = {
      attended_at: "2026-10-24", tooth: "26", treatment: "Tratamento endodôntico fictício de teste",
      cement: "Material fictício", irrigant: "Irrigante fictício", notes: "Sem validade clínica.", canals,
    };
    const visitResponse = await context.post(`/api/patients/${patient.id}/visits`, { data: visitInput });
    await expectStatus(visitResponse, 201);
    const visit = (await visitResponse.json()).visit;
    expect(visit.canals).toEqual(canals);
    await expectStatus(await context.post(`/api/patients/${patient.id}/visits`, { data: { ...visitInput, canals: [...canals, canals[0]] } }), 400);
    await expectStatus(await context.post(`/api/patients/${patient.id}/visits`, { data: { ...visitInput, attended_at: "2026-02-31" } }), 400);
    await expectStatus(await context.patch(`/api/visits/${visit.id}`, { data: { notes: "Evolução fictícia persistida." } }), 200);

    const appointmentInput = { patient_id: patient.id, date: "2026-10-24", time: "09:30", clinic: "Clínica fictícia", procedure: "Retorno fictício", status: "scheduled" };
    const appointmentResponse = await context.post("/api/appointments", { data: appointmentInput });
    await expectStatus(appointmentResponse, 201);
    const appointment = (await appointmentResponse.json()).appointment;
    for (const status of ["in_progress", "completed"]) {
      const response = await context.patch(`/api/appointments/${appointment.id}`, { data: { status } });
      await expectStatus(response, 200);
      expect((await response.json()).appointment.status).toBe(status);
    }
    await expectStatus(await context.patch(`/api/appointments/${appointment.id}`, { data: { status: "unknown" } }), 400);
    await expectStatus(await context.post("/api/appointments", { data: { ...appointmentInput, date: "2026-02-31" } }), 400);
    await expectStatus(await context.post("/api/appointments", { data: { ...appointmentInput, time: "24:00" } }), 400);
    await expectStatus(await context.get("/api/appointments?date=2026-02-31"), 400);

    const seededTemplates = await context.get("/api/templates");
    await expectStatus(seededTemplates, 200);
    expect((await seededTemplates.json()).templates).toHaveLength(2);
    const templateResponse = await context.post("/api/templates", {
      data: { title: "Modelo fictício personalizável", kind: "post_op", content: "Modelo inicial fictício." },
    });
    await expectStatus(templateResponse, 201);
    const template = (await templateResponse.json()).template;
    const content = "Paciente: {{paciente}}\nProfissional: {{profissional}}\nCRO: {{cro}}\nData: {{data}}\n\n"
      + Array.from({ length: 120 }, (_, index) => `Linha ${index + 1}: conteúdo fictício para validar paginação; sem recomendações clínicas.`).join("\n");
    await expectStatus(await context.patch(`/api/templates/${template.id}`, {
      data: { title: "Modelo fictício atualizado", content },
    }), 200);
    const documentResponse = await context.post("/api/documents", {
      data: { patient_id: patient.id, template_id: template.id, title: "Orientações fictícias", kind: "post_op", content },
    });
    await expectStatus(documentResponse, 201);
    const document = (await documentResponse.json()).document;
    expect(document.content).toContain(patient.name);
    expect(document.content).toContain("Dra. Fictícia de Teste");
    expect(document.content).toContain("AM-TESTE-000");
    expect(document.content).not.toContain("{{paciente}}");
    await verifyPdf(await context.get(`/api/documents/${document.id}/pdf`), 2);
    await expectStatus(await context.delete(`/api/templates/${template.id}`), 204);
    const retainedDocument = await context.get(`/api/documents/${document.id}`);
    await expectStatus(retainedDocument, 200);
    expect((await retainedDocument.json()).document).toMatchObject({ template_id: null, content: document.content });

    const uploaded = await context.post(`/api/patients/${patient.id}/radiographs`, {
      multipart: { file: { name: "radiografia-ficticia.png", mimeType: "image/png", buffer: image }, caption: "Imagem fictícia de teste", visit_id: visit.id },
    });
    await expectStatus(uploaded, 201);
    const radiograph = (await uploaded.json()).radiograph;
    expect(radiograph.filename).toBeUndefined();
    expect(radiograph.visit_id).toBe(visit.id);
    const privateImage = await context.get(`/api/radiographs/${radiograph.id}`);
    await expectStatus(privateImage, 200);
    expect(privateImage.headers()["content-type"]).toContain("image/jpeg");
    expect(privateImage.headers()["cache-control"]).toContain("private");
    expect(privateImage.headers()["cache-control"]).toContain("no-store");
    expect((await privateImage.body()).subarray(0, 3)).toEqual(Buffer.from([255, 216, 255]));
    await expectStatus(await context.post(`/api/patients/${patient.id}/radiographs`, {
      multipart: { file: { name: "malicious.png", mimeType: "image/png", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') } },
    }), 400);
    await verifyPdf(await context.get(`/api/patients/${patient.id}/report`), 2);

    // A fresh session must read database-backed records, not client memory.
    resumed = await newContext();
    await expectStatus(await resumed.post("/api/auth/login", { data: { email: account.email, password } }), 200);
    const persisted = await resumed.get(`/api/patients/${patient.id}`);
    await expectStatus(persisted, 200);
    const persistedBody = await persisted.json();
    expect(persistedBody.patient.notes).toBe("Anotação clínica fictícia atualizada.");
    expect(persistedBody.visits).toHaveLength(1);
    expect(persistedBody.visits[0]).toMatchObject({ id: visit.id, notes: "Evolução fictícia persistida.", canals });
    expect(persistedBody.radiographs).toHaveLength(1);
    expect(persistedBody.documents[0].content).toBe(document.content);
    const agenda = await resumed.get("/api/appointments?date=2026-10-24");
    expect((await agenda.json()).appointments.find((item: { id: string }) => item.id === appointment.id).status).toBe("completed");
    expect((await (await resumed.get("/api/profile")).json()).profile.cro).toBe("AM-TESTE-000");
    await expectStatus(await resumed.get(`/api/radiographs/${radiograph.id}`), 200);

    await expectStatus(await resumed.delete(`/api/patients/${patient.id}`), 200);
    await expectStatus(await resumed.get(`/api/patients/${patient.id}`), 404);
    await expectStatus(await resumed.get(`/api/radiographs/${radiograph.id}`), 404);
    await expectStatus(await resumed.get(`/api/documents/${document.id}`), 404);
    expect((await (await resumed.get("/api/appointments")).json()).appointments.some((item: { id: string }) => item.id === appointment.id)).toBe(false);
  } finally {
    await resumed?.dispose();
    await context.dispose();
  }
});

test("accounts cannot read, change or associate another professional's clinical records", async () => {
  const owner = await createAccount("Profissional proprietário fictício");
  const outsider = await createAccount("Outro profissional fictício");
  try {
    const patient = await createPatient(owner.context, "Paciente privado fictício");
    const otherPatient = await createPatient(outsider.context, "Paciente da outra conta fictícia");
    const visitResponse = await owner.context.post(`/api/patients/${patient.id}/visits`, {
      data: { attended_at: "2026-10-24", tooth: "11", treatment: "Registro fictício", canals: [{ name: "Único", odontometry: "20 mm", laf: "25" }] },
    });
    await expectStatus(visitResponse, 201);
    const visit = (await visitResponse.json()).visit;
    const image = await pngImage();
    const imageResponse = await owner.context.post(`/api/patients/${patient.id}/radiographs`, {
      multipart: { file: { name: "imagem-privada.png", mimeType: "image/png", buffer: image }, visit_id: visit.id },
    });
    await expectStatus(imageResponse, 201);
    const radiograph = (await imageResponse.json()).radiograph;
    const templates = (await (await owner.context.get("/api/templates")).json()).templates;
    const template = templates[0];
    const documentInput = { patient_id: patient.id, template_id: template.id, title: "Documento privado fictício", kind: template.kind, content: "Conteúdo privado fictício de teste." };
    const documentResponse = await owner.context.post("/api/documents", { data: documentInput });
    await expectStatus(documentResponse, 201);
    const document = (await documentResponse.json()).document;
    const appointmentInput = { patient_id: patient.id, date: "2026-10-24", time: "14:00", clinic: "Clínica fictícia", procedure: "Consulta fictícia" };
    const appointmentResponse = await owner.context.post("/api/appointments", { data: appointmentInput });
    await expectStatus(appointmentResponse, 201);
    const appointment = (await appointmentResponse.json()).appointment;

    await expectStatus(await outsider.context.get(`/api/patients/${patient.id}`), 404);
    await expectStatus(await outsider.context.patch(`/api/patients/${patient.id}`, { data: { name: "Alteração indevida" } }), 404);
    await expectStatus(await outsider.context.delete(`/api/patients/${patient.id}`), 404);
    await expectStatus(await outsider.context.post(`/api/patients/${patient.id}/visits`, { data: { attended_at: "2026-10-24", tooth: "11", treatment: "Indevido" } }), 404);
    await expectStatus(await outsider.context.patch(`/api/visits/${visit.id}`, { data: { notes: "Indevido" } }), 404);
    await expectStatus(await outsider.context.delete(`/api/visits/${visit.id}`), 404);
    await expectStatus(await outsider.context.get(`/api/radiographs/${radiograph.id}`), 404);
    await expectStatus(await outsider.context.delete(`/api/radiographs/${radiograph.id}`), 404);
    await expectStatus(await outsider.context.get(`/api/patients/${patient.id}/report`), 404);
    await expectStatus(await outsider.context.get(`/api/documents/${document.id}`), 404);
    await expectStatus(await outsider.context.get(`/api/documents/${document.id}/pdf`), 404);
    await expectStatus(await outsider.context.patch(`/api/documents/${document.id}`, { data: { content: "Indevido" } }), 404);
    await expectStatus(await outsider.context.delete(`/api/documents/${document.id}`), 404);
    await expectStatus(await outsider.context.get(`/api/templates/${template.id}`), 404);
    await expectStatus(await outsider.context.patch(`/api/templates/${template.id}`, { data: { content: "Indevido" } }), 404);
    await expectStatus(await outsider.context.post("/api/documents", { data: documentInput }), 404);
    await expectStatus(await outsider.context.post("/api/documents", { data: { ...documentInput, patient_id: otherPatient.id } }), 404);
    await expectStatus(await outsider.context.get(`/api/documents?patient_id=${patient.id}`), 404);
    await expectStatus(await outsider.context.post("/api/appointments", { data: appointmentInput }), 404);
    await expectStatus(await outsider.context.patch(`/api/appointments/${appointment.id}`, { data: { status: "cancelled" } }), 404);
    await expectStatus(await outsider.context.post(`/api/patients/${patient.id}/radiographs`, {
      multipart: { file: { name: "attempt.png", mimeType: "image/png", buffer: image } },
    }), 404);
    await expectStatus(await outsider.context.post(`/api/patients/${otherPatient.id}/radiographs`, {
      multipart: { file: { name: "attempt.png", mimeType: "image/png", buffer: image }, visit_id: visit.id },
    }), 404);

    const ownProfile = await outsider.context.get(`/api/profile?user_id=${owner.id}`);
    await expectStatus(ownProfile, 200);
    expect((await ownProfile.json()).profile.name).toBe(outsider.name);
    const profileMutation = await outsider.context.put("/api/profile", { data: { user_id: owner.id, name: "Perfil fictício atualizado da outra conta" } });
    await expectStatus(profileMutation, 200);
    expect((await (await owner.context.get("/api/profile")).json()).profile.name).toBe(owner.name);
    expect((await (await outsider.context.get("/api/patients")).json()).patients.map((item: { id: string }) => item.id)).not.toContain(patient.id);
    expect((await (await outsider.context.get("/api/templates")).json()).templates.map((item: { id: string }) => item.id)).not.toContain(template.id);
    await expectStatus(await owner.context.get(`/api/radiographs/${radiograph.id}`), 200);
    await verifyPdf(await owner.context.get(`/api/patients/${patient.id}/report`), 2);
    await expectStatus(await owner.context.delete(`/api/patients/${patient.id}`), 200);
    await expectStatus(await outsider.context.delete(`/api/patients/${otherPatient.id}`), 200);
  } finally {
    await owner.context.dispose();
    await outsider.context.dispose();
  }
});
