# Validação da atualização para Vercel e da identidade visual

Executada em 24/10/2026 (America/Manaus), com Node.js 24.19.0, usando exclusivamente contas, pacientes, imagens e documentos fictícios.

| Verificação | Resultado |
| --- | --- |
| `npm ci` com o lockfile atualizado | Passou |
| `npm run check` | Lint e TypeScript passaram; 39 testes passaram, sem falhas ou testes ignorados |
| `npm run test:postgres` com PostgreSQL 17 real local | 3 testes passaram, sem falhas ou testes ignorados |
| `VERCEL=1 npm run build:vercel` | Build Next.js para Vercel passou sem exigir credenciais durante o build |
| `npm run test:serverless` | 1 teste passou; configuração incompleta retorna 503 seguro e não cria banco local/temporário |
| `npm run build` | Build e servidor standalone passaram; fontes e WASM incluídos |
| `CLOUD_BROWSER_TESTS=1 npm run test:e2e` | 14 testes passaram com SQLite temporário isolado |
| `TEST_DATABASE_URL=… CLOUD_BROWSER_TESTS=1 npm run test:e2e` | 14 testes passaram com PostgreSQL 17 real local e arquivos privados locais |
| `npm run db:check` | Conexão, migrações e integridade SQLite verificadas; PostgreSQL também verificado pelo mesmo comando |
| `npm audit --omit=dev --audit-level=high` | Nenhuma vulnerabilidade encontrada nas dependências de produção |
| Servidor de desenvolvimento Webpack | Cadastro 201, perfil/grafia exata 200, logout, sessão encerrada 401 e novo login 200 verificados |
| Identidade visual | Login desktop, cadastro móvel e login escuro capturados; sem erro JavaScript ou overflow horizontal |

São **71 testes automatizados aprovados** nas cinco execuções de testes acima (39 + 3 + 1 + 14 + 14). As verificações visuais e de desenvolvimento são evidências adicionais, não testes contados novamente.

## O que foi exercitado

Os testes de API cobrem autenticação, cookies, proteção de origem, persistência em nova sessão, cadastros concorrentes, limites compartilhados, isolamento entre contas, agenda, pacientes, fichas/canais, imagens privadas, modelos, documentos, PDFs e exclusões. O mesmo conjunto executou nos dois bancos.

Foram verificados os cinco nomes solicitados e entradas com Unicode combinante, apóstrofo curvo e Han, preservando a grafia no cadastro, perfil, sessão e documentos. Testes de PDF reconstroem o texto do arquivo serializado; uma verificação independente com Poppler extraiu 12 nomes exatamente e renderizou os glifos sem avisos, incluindo japonês e coreano. Nomes com glifos ainda fora da cobertura recebem erro explícito, sem alterar o registro.

Os testes de navegador percorrem o fluxo completo em desktop e em tamanho de iPhone: cadastro, paciente, atendimento com canal, radiografia, relatório PDF, agenda/status, documento/PDF, perfil, tema persistente e logout. A PWA registrou o service worker e armazenou a nova marca, sem guardar rotas clínicas no cache offline.

O PostgreSQL real foi executado em um contêiner de teste acessível somente no loopback. Os testes de migração criaram schemas próprios e verificaram inicializações concorrentes, persistência após encerrar todos os pools, unicidade, chaves estrangeiras de propriedade e contadores atômicos. Nenhum banco remoto de produção foi usado.

## Limites da evidência

O adaptador Vercel Blob foi validado com cliente simulado, incluindo acesso privado, ausência de fallback local, limites e tratamento de falhas. Não havia token de um store remoto disponível; esses testes não comprovam permissões ou privacidade de um Blob Store real.

A validação móvel usa Chromium com emulação de iPhone. Safari/iPhone físico, instalação na Tela de Início e compartilhamento nativo com WhatsApp continuam exigindo validação manual em HTTPS. Os testes geram e baixam PDFs; não enviam documentos a terceiros.

As consultas a `endodelivery.vercel.app` foram bloqueadas pelo proxy de rede antes de atingir a aplicação. Não havia autenticação Vercel para consultar variáveis ou logs. **O deploy e o cadastro no site publicado não foram confirmados.** A configuração externa e a validação necessária estão em [Vercel](vercel.md); a análise do problema está em [Diagnóstico](production-diagnosis.md).

O Dockerfile da aplicação e o workflow GitHub Actions foram preparados, mas não executados nessa infraestrutura de destino. Também não foi validada uma nova tarefa restaurada do snapshot. Consulte [Privacidade](privacy.md) antes de planejar uso com dados reais.
