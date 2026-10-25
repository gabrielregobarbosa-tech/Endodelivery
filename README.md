# EndoDelivery

Aplicação web responsiva para organização clínica de endodontistas. A primeira etapa reúne pacientes, fichas clínicas, radiografias privadas, agenda diária, documentos em PDF e perfil profissional, com interface em português, modo claro/escuro e instalação como PWA.

Este repositório está em desenvolvimento. Utilize **somente dados fictícios**; a implantação com dados reais depende dos controles descritos em [Privacidade](docs/privacy.md).

Para configurar a aplicação publicada em **https://endodelivery.vercel.app**, siga o [guia da Vercel](docs/vercel.md): PostgreSQL gerenciado e Blob privado são obrigatórios nessa plataforma. O aplicativo recusa persistência local/temporária na Vercel e informa indisponibilidade quando os serviços não estão configurados. Um build concluído não comprova cadastro, armazenamento ou deploy funcionando.

## Executar no navegador

Requisitos: Node.js 24.x e npm. Não é necessário instalar um servidor de banco de dados.

```bash
cd Endodelivery
npm ci
cp .env.example .env.local
npm run dev
```

Abra `http://localhost:3000` no navegador. Clique em **Criar conta**, informe nome, e-mail fictício e uma senha de pelo menos 10 caracteres. Não existe usuário ou senha padrão. O cadastro cria uma conta isolada e dois modelos editáveis de documentos.

Desenvolvimento e build usam Webpack. Nesta máquina, o modo de desenvolvimento com Turbopack apresentou um ciclo de recompilações/recarregamentos durante a validação visual; o script usa o mesmo compilador verificado no build de produção.

O banco SQLite é criado e migrado automaticamente em `data/endodelivery.sqlite`. Radiografias ficam em `data/uploads`, fora da pasta pública. Esses arquivos persistem entre reinicializações e não são incluídos no Git. Preserve ambos juntos para manter os registros e suas imagens.

Quando `DATABASE_URL` ou `POSTGRES_URL` está configurada, o mesmo domínio usa PostgreSQL. `DATABASE_PROVIDER=sqlite` pode selecionar o modo local fora da Vercel; a Vercel exige PostgreSQL. Migrações preservam os dados existentes no backend escolhido e coordenam inicializações simultâneas. Trocar de backend não importa automaticamente registros ou arquivos antigos.

## Experimentar os fluxos

1. Em **Meu perfil**, preencha nome profissional, especialidade, CRO e contato fictícios. Adicione um logotipo PNG ou JPEG de até 750 KB. Essas informações serão inseridas no cabeçalho dos PDFs.
2. Em **Pacientes**, cadastre uma pessoa fictícia e o profissional indicador. Abra sua ficha e registre um atendimento com data, elemento dentário, tratamento, cimento, irrigante e observações.
3. Acrescente os canais e informe a odontometria e a LAF de cada um. O histórico preserva os atendimentos associados ao paciente.
4. Envie uma imagem fictícia em JPEG, PNG ou WebP, com até 20 megapixels, e escreva sua legenda. O limite é 10 MiB localmente e 4 MiB na Vercel; a interface informa o limite vigente. A visualização e o download exigem a sessão do proprietário. HEIC e DICOM não são suportados nesta etapa.
5. Gere o relatório endodôntico do paciente e confira informações clínicas, cabeçalho e imagens no PDF.
6. Em **Agenda do dia**, selecione a data, cadastre o atendimento com horário, paciente, clínica e procedimento. Experimente os status agendado, em atendimento, concluído e cancelado.
7. Em **Documentos**, edite um modelo de receituário ou de orientações pós-operatórias, selecione um paciente e personalize o texto antes de salvar e gerar o PDF. O aplicativo não prescreve medicamentos nem recomenda tratamentos automaticamente.
8. Em **Meu perfil**, altere a aparência entre claro, escuro e sistema. Ao terminar em um dispositivo compartilhado, encerre a sessão.

Os modelos aceitam `{{paciente}}`, `{{profissional}}`, `{{cro}}` e `{{data}}`. As variáveis restantes no conteúdo são substituídas ao emitir o documento; o texto emitido é salvo de forma independente do modelo.

O nome profissional aceita pontos, acentos, hífens, apóstrofos e Unicode, com limite de 2 a 120 caracteres. Cadastro e Perfil usam a mesma validação. A grafia é preservada no banco e nas fontes Unicode incorporadas aos PDFs; caracteres fora da cobertura das fontes produzem uma mensagem explícita, sem modificar o cadastro.

## iPhone e compartilhamento

No Safari, acesse a aplicação por um endereço HTTPS, abra o menu **Compartilhar** e escolha **Adicionar à Tela de Início**. A aplicação adapta sua navegação para telas pequenas. HTTP em `localhost` serve para desenvolvimento na própria máquina; o iPhone precisa de um endereço acessível e HTTPS para os recursos de PWA e compartilhamento.

O compartilhamento do PDF ocorre em duas etapas: prepare o arquivo e, quando estiver disponível, toque no botão para compartilhá-lo. Isso mantém a ação do usuário exigida pelo Safari. Escolha o WhatsApp na folha de compartilhamento do iPhone, quando instalado e disponível. Em navegadores sem compartilhamento de arquivos, baixe o PDF e envie-o pelo aplicativo desejado.

O modo offline exibe apenas uma página pública de indisponibilidade. Fichas, documentos, radiografias e respostas da API **não** são armazenados pelo service worker.

## Comandos de desenvolvimento

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento na porta 3000 |
| `npm run check` | Lint, TypeScript e testes automatizados |
| `npm run typecheck` | Verificação dos tipos |
| `npm test` | Testes de unidade/integração de módulos |
| `npm run db:check` | Verificar conexão e migrações do banco selecionado |
| `npm run build` | Build de produção |
| `npm run build:vercel` | Build Next.js para a Vercel |
| `npm start` | Executar o build de produção |
| `npm run test:e2e` | Testes de API e navegador com Playwright |
| `npm run test:postgres` | Integração com PostgreSQL real, requer `TEST_DATABASE_URL` de teste |

Para preparar o navegador usado pelos testes:

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

No Linux, bibliotecas do sistema podem ser necessárias; em uma máquina com permissão administrativa, use `npx playwright install --with-deps chromium`. A integração contínua executa as verificações e os testes com dados fictícios.

No ambiente Linux na nuvem, o navegador incluído na dependência de teste pode ser usado sem download adicional de browsers: `CLOUD_BROWSER_TESTS=1 npm run test:e2e`. O projeto testa Chromium no desktop e em tamanho de iPhone; isso não substitui validar o Safari e o compartilhamento no iPhone físico.

## Configuração

Consulte `.env.example`. As variáveis são opcionais para o desenvolvimento local:

| Variável | Padrão | Uso |
| --- | --- | --- |
| `DATABASE_PATH` | `data/endodelivery.sqlite` | Caminho do arquivo SQLite |
| `FILE_STORAGE_PATH` | `data/uploads` | Diretório privado das radiografias |
| `APP_ORIGIN` | Origem da requisição | Origem pública exata, como `https://clinica.example.com`, usada para validar mutações em produção |

O servidor precisa de permissão de leitura e escrita no banco e no diretório de imagens. Não configure o armazenamento em `public/`. Não coloque credenciais, banco, imagens ou PDFs em arquivos versionados. Cookies de sessão usam `Secure` em produção: publique por HTTPS com um proxy confiável.

## Contêiner

```bash
docker build -t endodelivery .
docker volume create endodelivery-data
docker run --rm --name endodelivery -p 3000:3000 \
  -e APP_ORIGIN=https://clinica.example.com \
  -v endodelivery-data:/app/data endodelivery
```

Este exemplo exige um proxy HTTPS na frente do contêiner para login e uso real. Se usar um diretório do host no lugar de um volume nomeado, ajuste sua propriedade para o usuário `node` do contêiner (UID/GID 1000) e mantenha permissões privadas. Não exponha o volume pela web. O contêiner é de instância única: o SQLite e os uploads exigem armazenamento persistente compartilhado com o processo, sem réplicas de escrita independentes.

## Estrutura e próximos passos

- `app/`: páginas Next.js e endpoints REST autenticados.
- `components/`: interface, navegação e interação no navegador.
- `lib/`: autenticação, banco, armazenamento privado e geração de PDF.
- `tests/`: testes automatizados com dados fictícios.
- `docs/`: [arquitetura](docs/architecture.md), [API](docs/api.md) e [privacidade](docs/privacy.md).

A API REST e o modelo de dados estão separados da interface para permitir um cliente SwiftUI futuro. Não há aplicativo nativo implementado. Esta etapa também não inclui confirmação de e-mail, recuperação de senha, MFA, trilha completa de auditoria ou backups automatizados; esses itens precisam ser tratados antes de uma implantação clínica com dados reais.
