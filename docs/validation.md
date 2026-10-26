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
| Site publicado | Login HTTP 200, SVG da nova marca idêntico e slogan oficial confirmados |
| Cadastro publicado | HTTP 503 com `SERVICE_CONFIGURATION`; bloqueio de configuração do banco confirmado, sem criação de conta |

São **71 testes automatizados aprovados** nas cinco execuções de testes acima (39 + 3 + 1 + 14 + 14). As verificações visuais e de desenvolvimento são evidências adicionais, não testes contados novamente.

## O que foi exercitado

Os testes de API cobrem autenticação, cookies, proteção de origem, persistência em nova sessão, cadastros concorrentes, limites compartilhados, isolamento entre contas, agenda, pacientes, fichas/canais, imagens privadas, modelos, documentos, PDFs e exclusões. O mesmo conjunto executou nos dois bancos.

Foram verificados os cinco nomes solicitados e entradas com Unicode combinante, apóstrofo curvo e Han, preservando a grafia no cadastro, perfil, sessão e documentos. Testes de PDF reconstroem o texto do arquivo serializado; uma verificação independente com Poppler extraiu 12 nomes exatamente e renderizou os glifos sem avisos, incluindo japonês e coreano. Nomes com glifos ainda fora da cobertura recebem erro explícito, sem alterar o registro.

Os testes de navegador percorrem o fluxo completo em desktop e em tamanho de iPhone: cadastro, paciente, atendimento com canal, radiografia, relatório PDF, agenda/status, documento/PDF, perfil, tema persistente e logout. A PWA registrou o service worker e armazenou a nova marca, sem guardar rotas clínicas no cache offline.

O PostgreSQL real foi executado em um contêiner de teste acessível somente no loopback. Os testes de migração criaram schemas próprios e verificaram inicializações concorrentes, persistência após encerrar todos os pools, unicidade, chaves estrangeiras de propriedade e contadores atômicos. Nenhum banco remoto de produção foi usado.

## Limites da evidência

O adaptador Vercel Blob foi validado com cliente simulado, incluindo acesso privado, ausência de fallback local, limites e tratamento de falhas. Não havia token de um store remoto disponível; esses testes não comprovam permissões ou privacidade de um Blob Store real.

A validação móvel usa Chromium com emulação de iPhone. Safari/iPhone físico, instalação na Tela de Início e compartilhamento nativo com WhatsApp continuam exigindo validação manual em HTTPS. Os testes geram e baixam PDFs; não enviam documentos a terceiros.

As primeiras consultas foram bloqueadas pelo proxy; posteriormente foi possível alcançar `endodelivery.vercel.app`. Após o push, o login retornou 200 e a marca publicada foi comparada byte a byte com o novo SVG. O cadastro com dados fictícios retornou 503 `SERVICE_CONFIGURATION`; a verificação do banco retornou o mesmo código. A atualização está publicada, mas **cadastro e banco de produção ainda estão bloqueados por configuração**. Nenhuma conta foi criada nessa tentativa. Não havia autenticação Vercel para consultar variáveis ou logs. A configuração externa e a validação necessária estão em [Vercel](vercel.md); as referências das falhas estão em [Diagnóstico](production-diagnosis.md).

O Dockerfile da aplicação e o workflow GitHub Actions foram preparados, mas não executados nessa infraestrutura de destino. Também não foi validada uma nova tarefa restaurada do snapshot. Consulte [Privacidade](privacy.md) antes de planejar uso com dados reais.

## Atualização de autenticação Blob — 26/10/2026

As capturas fornecidas pelo usuário mostraram a integração atual com `BLOB_STORE_ID` e `BLOB_WEBHOOK_PUBLIC_KEY`. A exigência exclusiva de `BLOB_READ_WRITE_TOKEN` foi corrigida para aceitar a identidade automática OIDC do projeto conectado. A documentação foi alinhada à configuração atual da Vercel.

- `npm run check`: lint, TypeScript e **44 testes** passaram, sem falhas ou testes ignorados. O conjunto de armazenamento passou de cinco para dez testes.
- `VERCEL=1 npm run build:vercel`: passou com a configuração final.
- `npm run test:serverless`: um teste passou; continua recusando banco local/temporário na Vercel sem configuração persistente.
- `npm run build` e `CLOUD_BROWSER_TESTS=1 npm run test:e2e`: build standalone passou e os **14 testes** de API, desktop e celular passaram, incluindo o fluxo clínico completo com imagens e PDFs. São **59 testes aprovados nesta etapa** (44 + 1 + 14), sem repetir na contagem os resultados da etapa anterior.
- O servidor de desenvolvimento foi reiniciado e verificado: banco pronto em `/api/health` (200), login (200) e pacientes sem sessão (401). O servidor permanece disponível internamente na porta 3000.
- O SDK oficial instalado foi exercitado com transporte simulado, toda conexão externa bloqueada e identidades exclusivamente fictícias no contexto de requisição da Vercel. Envio, leitura privada sem cache e exclusão usaram a identidade atual após cada troca de contexto, sem `VERCEL_OIDC_TOKEN` no ambiente ou credencial OIDC passada manualmente. Isso verifica a integração com o SDK e a ausência de captura da identidade, mas não demonstra permissões no serviço remoto.
- Também foram verificados token estático fora da Vercel, rejeição e limpeza de objeto público, configurações incompletas sem fallback na Vercel e armazenamento local funcional quando existe apenas uma identidade Vercel genérica para outro serviço.

O PostgreSQL não foi alterado nesta correção. Os testes com PostgreSQL real de 24/10 permanecem evidência da etapa anterior e não foram contados como nova execução.

## Verificação em produção e correção do PDF — 26/10/2026

Após a implantação OIDC, o banco, cadastro, perfil, pacientes, upload/leitura de imagem privada, recusa de acesso anônimo, logout/login e persistência em nova sessão foram verificados no endereço publicado. Pacientes e imagens artificiais foram excluídos ao final e a remoção foi confirmada por respostas 404. As contas técnicas de teste permanecem sem dados clínicos e sem credenciais padrão.

O relatório sem imagem passou, mas o relatório com JPEG artificial expôs uma falha de interpretação de fatias de `Buffer` no parser JPEG de `pdf-lib`. O mesmo erro foi reproduzido localmente, inclusive com o buffer retornado pelo leitor de Blob. A incorporação agora recebe uma cópia exata dos bytes, tanto para radiografias como para logotipos. O teste de regressão verifica conteúdo e dimensões dos dois objetos JPEG no PDF serializado; ele falhava antes da correção. Os nove testes de PDF passaram após a alteração. `npm run check` passou com lint, TypeScript e **45 testes**, e `npm run build` passou com o servidor standalone preparado.

Após publicar `494ac24`, a execução no endereço de produção concluiu com sucesso:

| Fluxo com dados artificiais | Resultado |
| --- | --- |
| Banco e migrações | 200, banco pronto |
| Cadastro, perfil e logotipo PNG | 201 / 200 / 200; grafia preservada |
| Paciente e ficha com odontometria/LAF | 201 / 201 |
| Compromisso e mudança de status | 201 / 200 |
| Modelos, emissão de documento e PDF | 200 / 201 / 200 |
| Relatório sem imagem | 200, arquivo PDF válido |
| Imagem privada e relatório com imagem | 201 / 200 / 200, JPEG e PDF válidos |
| Imagem sem autenticação | 401 |
| Logout, sessão encerrada e novo login | 200 / 401 / 200 |
| Dados e imagem em nova sessão | 200, vínculos persistidos |
| Remoção final dos dados clínicos artificiais | 200; paciente/imagem 404, documentos e agenda vazios |

Essa execução usa a API pública do site com contas fictícias próprias e o Blob real conectado, demonstrando as operações autorizadas e a proteção pelo aplicativo. Não houve acesso ao painel administrativo, aos logs ou aos valores de credenciais. A validação em Safari/iPhone físico continua pendente; a navegação visual foi validada em Chromium.
