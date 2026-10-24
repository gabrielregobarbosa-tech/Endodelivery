# Validação da primeira etapa

Executada em 24/10/2026, com Node.js 24.19.0 e dados exclusivamente fictícios.

| Verificação | Resultado |
| --- | --- |
| Instalação reproduzível com `npm ci` e lockfile | Passou |
| `npm run check` | Lint e TypeScript passaram; 15 testes passaram, sem falhas ou testes ignorados |
| `npm run db:check` | Conexão, migração e integridade SQLite verificadas |
| `npm run build` | Build de produção e servidor standalone gerados |
| `CLOUD_BROWSER_TESTS=1 npm run test:e2e` | 5 testes passaram, sem falhas ou testes ignorados |
| `npm audit --omit=dev --audit-level=high` | Nenhuma vulnerabilidade encontrada nas dependências de produção |
| Servidor de desenvolvimento | Inicialização, login HTTP 200, banco pronto e acesso clínico sem sessão HTTP 401 |

Os três testes de API cobrem autenticação, proteção de origem, persistência em nova sessão, associações entre registros, validações, agenda, imagens privadas, PDFs, modelos e exclusões. Contas distintas não conseguem ler, modificar ou vincular registros de outra conta.

Os dois testes de navegador percorrem o mesmo fluxo completo em desktop e em tamanho de iPhone: cadastro de conta e paciente, atendimento com canal, radiografia, relatório PDF, agenda/status, documento/PDF, perfil, tema persistente e logout. O Chromium do ambiente usa renderização sem WebGL; o renderizador gráfico por software padrão apresentou travamentos neste runner. As verificações de segurança do navegador permanecem habilitadas. Capturas adicionais podem ser solicitadas com `CAPTURE_UI=1`.

A validação móvel usa Chromium com emulação de iPhone. Safari/iPhone físico, instalação pela Tela de Início, seletor nativo de compartilhamento e envio pelo WhatsApp exigem validação manual em HTTPS. O teste automatizado verifica a geração e o download dos arquivos, sem enviar documentos a terceiros.

O Dockerfile e a configuração de CI foram preparados, mas não executados em um daemon Docker ou no GitHub Actions durante esta etapa. Também não foi validada a restauração em uma nova tarefa da nuvem nem realizada implantação clínica. Consulte `privacy.md` antes de planejar uso com dados reais.
