# Desenvolvimento do EndoDelivery

- Utilize este checkout. Cada tarefa na nuvem já é isolada; não crie worktrees sem solicitação.
- Node.js 24.x é necessário para `node:sqlite`. Instale com `npm ci` e mantenha o lockfile.
- Execute `npm run check` e `npm run build` após mudanças relevantes. `npm run test:e2e` usa um servidor de produção na porta 3100 e dados temporários; no Linux desta nuvem, use `CLOUD_BROWSER_TESTS=1`.
- Desenvolvimento: `npm run dev`, porta 3000. Produção local: `npm run build` e `npm start`.
- Use somente contas, pacientes, imagens e documentos fictícios durante desenvolvimento e testes.
- Todas as operações clínicas devem autenticar a sessão, conferir o proprietário e validar vínculos. Mutações devem passar por `assertSameOrigin` e validação de entrada.
- Não disponibilize banco ou radiografias em `public/`, não registre conteúdo clínico nos logs e não salve informações clínicas no `localStorage` ou no cache do service worker.
- Migrações ficam em `lib/db.ts`; preserve dados existentes. Banco, uploads, `.env`, cookies e relatórios de teste não pertencem ao Git.
- APIs REST usam `snake_case`; mantenha a interface e o domínio desacoplados para o futuro cliente SwiftUI.
- A interface é em português brasileiro, responsiva para iPhone e acessível por teclado. Preserve temas claro/escuro e áreas seguras do dispositivo.
- Compartilhar PDFs no Safari requer um clique direto depois de preparar o arquivo. Não automatize envio a contatos ou serviços de mensagens.
- Consulte `docs/privacy.md` para os limites da primeira etapa; não apresente o aplicativo como certificado para uso clínico ou conforme à LGPD apenas por passar nos testes.
