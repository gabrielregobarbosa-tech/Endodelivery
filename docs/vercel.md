# Configurar o EndoDelivery na Vercel

O aplicativo precisa de **PostgreSQL persistente** para contas e registros, e de um **Blob Store privado** para radiografias. O SQLite e a pasta de arquivos do desenvolvimento local não são persistência adequada para funções serverless da Vercel. A configuração abaixo deve ser feita no projeto que atende `https://endodelivery.vercel.app`.

## 1. Conectar o banco e o armazenamento

1. Abra o projeto **Endodelivery** na Vercel e acesse a área **Storage**.
2. Adicione ou conecte uma integração PostgreSQL gerenciada, como **Neon**. Se já existe um banco adequado, conecte-o ao projeto; não é necessário criar outro apenas para esta alteração.
3. Use a conexão com **pooler** fornecida pela integração. Ela deve permitir gravar registros e inicializar o esquema; uma conexão somente de leitura não atende ao aplicativo. Preserve a configuração TLS indicada pelo provedor.
4. Na área Storage, crie ou conecte um **Vercel Blob Store com acesso privado**. Um store público não deve receber radiografias.
5. Conecte os dois serviços ao projeto para que as integrações disponibilizem suas variáveis de ambiente. Os nomes das ações podem variar entre a Vercel e o provedor.

Não copie URLs de conexão, senhas ou tokens para o chat, para o GitHub ou para arquivos versionados. Valores de credenciais devem permanecer nas configurações seguras dos serviços.

## 2. Conferir as variáveis de produção

Em **Settings → Environment Variables**, confira o ambiente **Production**:

| Nome | O que configurar |
| --- | --- |
| `DATABASE_URL` **ou** `POSTGRES_URL` | URL PostgreSQL com pooler gerada pelo provedor. A aplicação aceita os dois nomes; prefira o nome criado pela integração. Não use um valor de exemplo. |
| `DATABASE_PROVIDER` | `postgres` |
| `BLOB_READ_WRITE_TOKEN` | Token disponibilizado automaticamente pela conexão do Blob Store privado ao projeto. |
| `STORAGE_PROVIDER` | `vercel-blob` |
| `APP_ORIGIN` | `https://endodelivery.vercel.app` |

Não configure `DATABASE_PATH` ou `FILE_STORAGE_PATH` como solução de persistência na Vercel. Também não redirecione o banco ou as radiografias para `/tmp`: esse diretório é temporário. A aplicação recusa armazenamento clínico local nesse ambiente.

Se algum serviço só foi conectado a Preview ou Development, ajuste a conexão para Production. Uma variável adicionada depois de um deploy exige uma nova implantação para ser utilizada. Para outro domínio oficial ou uma implantação Preview, configure a origem HTTPS correspondente nesse ambiente.

## 3. Conferir o build e implantar

1. Em Settings do projeto, selecione **Node.js 24.x**.
2. O arquivo `vercel.json` já declara o framework **Next.js** e o comando **`npm run build:vercel`**. Se existe um override manual de build antigo, alinhe-o a essa configuração.
3. O modo `standalone` e os scripts de inicialização locais são usados fora da Vercel. Não é necessário iniciar `scripts/start.mjs` como servidor nessa plataforma.
4. Depois que os commits atualizados estiverem na branch `main`, o push dispara a implantação se a integração GitHub do projeto estiver configurada para essa branch.
5. Após alterar variáveis, abra **Deployments** e execute **Redeploy** da implantação que contém o código atualizado. Reimplantar um commit antigo não incorpora as correções novas.
6. Aguarde o estado **Ready** e abra o endereço de produção. Esse estado confirma a implantação, mas ainda é necessário testar os serviços abaixo.

## 4. Confirmar o funcionamento no site publicado

Use exclusivamente contas, pacientes, documentos e imagens fictícios:

1. Abra o site em uma janela nova e cadastre uma conta de teste com um e-mail exclusivo para a validação.
2. Confira grafias com pontos, acentos, hífen e apóstrofo. As entradas solicitadas incluem `Gabriel Barbosa`, `Dr. Gabriel Barbosa`, `Dr. Gabriel R. Barbosa`, `Drª. Ana Maria` e `João D'Ávila`; use-as somente como entradas de demonstração, sem dados clínicos reais.
3. Verifique a grafia no Perfil. Faça logout, feche a janela, reabra e faça login. Confira novamente os dados; repita após uma nova implantação para validar persistência entre execuções.
4. Cadastre um paciente inteiramente fictício e registre atendimento, canais, odontometria e LAF. Teste também agenda e documentos.
5. Envie uma imagem fictícia, abra a radiografia e gere um relatório PDF. Confira nome profissional, acentos e conteúdo do documento.
6. Crie outra conta em uma janela privada: ela não deve listar pacientes da primeira conta nem abrir suas radiografias ou seus PDFs por links copiados.
7. Confira a nova marca no login, cadastro e cabeçalho. No Safari do iPhone, teste a navegação, o PDF e o compartilhamento nativo em HTTPS. Para a PWA, use **Compartilhar → Adicionar à Tela de Início**.

Considere o cadastro corrigido em produção somente depois de confirmar cadastro, login e persistência no endereço publicado. Um build bem-sucedido ou um teste local não demonstra que o banco e o Blob Store de produção estão acessíveis.

## 5. Se aparecer uma mensagem de erro

Na área de logs de execução do projeto (**Logs / Runtime Logs**), filtre a rota **`/api/auth/register`** no horário da tentativa. As indisponibilidades geram o evento `endodelivery.service_unavailable`, com `reference`, `service` e `code` seguros para diagnóstico. A referência também é retornada na resposta da API para correlacionar a tentativa.

Compartilhe apenas horário, status HTTP, referência e código seguro do erro. Não envie corpos de requisições, senhas, cookies, tokens, URLs de conexão ou dumps de ambiente.

| Resposta | Verificação útil |
| --- | --- |
| `400` — validação | Confira os campos e a confirmação de senha. Uma conta de teste já existente deve usar login ou outro e-mail de teste. |
| `503` — configuração | Confira as variáveis no ambiente Production e se ocorreu Redeploy depois de configurá-las. |
| `503` — dados | Confira o estado do PostgreSQL, a URL com pooler e a conexão do serviço ao projeto. |
| `503` — imagens | Confira o token, a conexão do Blob Store e seu modo privado. |
| `500` — erro inesperado | Localize a referência nos logs para investigação; não tente corrigir movendo dados clínicos para arquivos temporários. |

## Limites e preservação dos dados

- A plataforma impõe limite técnico de corpo de cerca de 4,5 MB. O aplicativo limita radiografias a **4 MiB na Vercel** para deixar margem ao formulário multipart, e PDFs gerados a **4 MiB**. Fora da Vercel, o limite de upload local é **10 MiB**.
- Imagens aceitas: JPEG, PNG e WebP, até 20 megapixels. Não há suporte a HEIC ou DICOM. A normalização remove metadados e não reduz silenciosamente as dimensões para contornar limites; não substitua originais clínicos por versões reduzidas apenas para enviar um arquivo maior.
- Os PDFs incorporam DejaVu Sans e usam Noto CJK sob demanda para nomes com Han, Kana e Hangul. Pontuação, acentos e grafia são preservados. Se um nome contém um glifo ainda não suportado pelas fontes, a exportação retorna `422` e o cadastro permanece intacto; não altera o nome silenciosamente.
- Se existem dados no SQLite original ou radiografias locais, esta configuração **não os importa nem os apaga automaticamente**. Preserve backups consistentes e planeje uma migração separada antes de trocar o armazenamento de dados existentes.
- Testes com PostgreSQL real local não confirmam acesso ao Neon de produção. Testes locais do adaptador Blob com SDK simulado não confirmam token, privacidade ou permissões do store remoto; isso precisa ser validado no deploy.

Nesta sessão não há acesso autorizado ao painel ou aos logs da Vercel, e as consultas ao domínio pela rede do ambiente foram bloqueadas com `403`. Esse bloqueio não confirma o estado do site para outros usuários. Portanto, o deploy e o cadastro publicados **ainda não estão confirmados** por esta execução.

Esses passos não representam certificação de conformidade com a LGPD nem liberação para usar dados clínicos reais. Consulte `privacy.md` para os controles operacionais e as limitações de privacidade.
