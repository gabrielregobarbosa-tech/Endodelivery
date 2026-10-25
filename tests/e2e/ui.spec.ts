import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

test("profissional cadastra paciente, ficha, radiografia, agenda e documento", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const patientName = "Paciente Fictícia de Teste";

  await page.goto("/register");
  await page.getByLabel("Seu nome profissional").fill("Dra. Exemplo Fictício");
  await page.getByLabel("E-mail", { exact: true }).fill(`ui-${randomUUID()}@example.test`);
  await page.getByLabel(/^Senha/).fill("Teste-ficticio-2026!");
  await page.getByLabel("Confirme a senha").fill("Teste-ficticio-2026!");
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  await expect(page).toHaveURL(/\/patients$/);
  await expect(page.getByRole("heading", { name: "Pacientes", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Novo paciente", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome completo").fill(patientName);
  await dialog.getByLabel("Profissional indicador").fill("Dr. Indicador Fictício");
  await dialog.getByLabel("Data de nascimento").fill("1990-01-15");
  await dialog.getByRole("button", { name: "Cadastrar paciente", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("link").filter({ hasText: patientName }).click();
  await expect(page.getByRole("heading", { name: patientName, exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Novo atendimento", exact: true }).first().click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Data do atendimento").fill("2026-10-24");
  await dialog.getByLabel("Elemento dentário").fill("36");
  await dialog.getByLabel("Tratamento realizado").fill("Registro clínico fictício");
  await dialog.getByLabel("Canal 1", { exact: true }).fill("MV");
  await dialog.getByLabel("Odontometria canal 1", { exact: true }).fill("21 mm");
  await dialog.getByLabel("LAF canal 1", { exact: true }).fill("35");
  await dialog.getByLabel("Cimento utilizado").fill("Material fictício");
  await dialog.getByLabel("Irrigante").fill("Registro fictício");
  await dialog.getByRole("button", { name: "Salvar atendimento" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Registro clínico fictício" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "21 mm", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Adicionar radiografia", exact: true }).click();
  dialog = page.getByRole("dialog");
  const image = await sharp({ create: { width: 160, height: 120, channels: 3, background: "#64748b" } }).png().toBuffer();
  await dialog.getByLabel(/^Imagem da radiografia/).setInputFiles({ name: "radiografia-ficticia.png", mimeType: "image/png", buffer: image });
  await dialog.getByLabel("Legenda", { exact: true }).fill("Imagem inteiramente fictícia");
  await dialog.getByRole("button", { name: "Adicionar radiografia", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("img", { name: "Imagem inteiramente fictícia" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Registro clínico fictício" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Imagem inteiramente fictícia" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  if (process.env.CAPTURE_UI === "1") await page.screenshot({ path: testInfo.outputPath("prontuario.png"), fullPage: true });

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Relatório PDF", exact: true }).click();
  const report = await download;
  expect(report.suggestedFilename()).toMatch(/\.pdf$/);
  expect(await report.failure()).toBeNull();

  await page.locator('a[href="/agenda"]:visible').first().click();
  await expect(page.getByRole("heading", { name: "Sua agenda", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Novo compromisso", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Paciente", exact: true }).selectOption({ label: patientName });
  await dialog.getByLabel("Horário", { exact: true }).fill("09:30");
  await dialog.getByLabel("Clínica", { exact: true }).fill("Clínica Fictícia");
  await dialog.getByLabel("Procedimento", { exact: true }).fill("Atendimento de teste");
  await dialog.getByRole("button", { name: "Agendar compromisso" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: patientName, exact: true })).toBeVisible();
  await page.getByLabel("Status do compromisso de 09:30").selectOption("completed");
  await expect(page.getByLabel("Status do compromisso de 09:30")).toHaveValue("completed");

  await page.locator('a[href="/documents"]:visible').first().click();
  await expect(page.getByRole("heading", { name: "Seus modelos", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Novo documento", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Tipo", exact: true }).selectOption("post_op");
  await dialog.getByRole("combobox", { name: "Paciente (opcional)", exact: true }).selectOption({ label: patientName });
  await dialog.getByLabel("Título", { exact: true }).fill("Orientação fictícia");
  await dialog.getByLabel(/^Conteúdo/).fill("Documento de teste para {{paciente}}. Sem finalidade clínica.");
  await dialog.getByRole("button", { name: "Salvar documento", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Orientação fictícia", exact: true })).toBeVisible();
  const documentDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "PDF", exact: true }).click();
  expect((await documentDownload).suggestedFilename()).toMatch(/\.pdf$/);

  await page.locator('a[href="/profile"]:visible').first().click();
  await page.getByLabel("CRO", { exact: true }).fill("TESTE 00000");
  await page.getByLabel("Especialidade", { exact: true }).fill("Endodontia");
  await page.getByRole("button", { name: "Salvar perfil", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Perfil salvo" })).toBeVisible();
  await page.getByRole("button", { name: "Escuro", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByLabel("CRO", { exact: true })).toHaveValue("TESTE 00000");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  if (process.env.CAPTURE_UI === "1") await page.screenshot({ path: testInfo.outputPath("perfil-escuro.png"), fullPage: true });
  await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active))).toBeTruthy();
  const cachedPublicPaths = await page.evaluate(async () => {
    const paths: string[] = [];
    for (const key of await caches.keys()) {
      if (!key.startsWith("endodelivery-public-")) continue;
      for (const request of await (await caches.open(key)).keys()) paths.push(new URL(request.url).pathname);
    }
    return paths;
  });
  expect(cachedPublicPaths).toContain("/brand/mark.svg");
  expect(cachedPublicPaths.some((path) => path.startsWith("/api/") || path.startsWith("/patients"))).toBeFalsy();
  await page.getByRole("button", { name: "Sair da conta", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});
