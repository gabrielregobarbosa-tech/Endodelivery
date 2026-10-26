# Cadastro e persistência na Vercel

## Evidência disponível

- O commit inicial `213b426` abria SQLite em `process.cwd()/data/endodelivery.sqlite` durante o cadastro, criava diretórios e executava migrações síncronas. Não havia conexão PostgreSQL nem adaptador de armazenamento remoto.
- Esse fluxo depende de disco local persistente. O filesystem da aplicação em funções serverless da Vercel não oferece essa garantia; `/tmp` não é persistência clínica e não foi usado como correção.
- O nome profissional já aceitava pontuação no cadastro inicial. Uma mensagem genérica de erro não demonstra que pontos ou acentos eram a causa da falha. Havia, porém, perda de caracteres fora de WinAnsi na exportação PDF, corrigida com fontes Unicode.
- As consultas iniciais foram bloqueadas pelo proxy com `CONNECT ... 403`; posteriormente o acesso ficou disponível. Após o push, o site retornou login HTTP 200 com o slogan oficial e SVG idêntico à nova marca. A atualização publicada foi confirmada por essas respostas.
- Não havia autenticação Vercel ou arquivo de vínculo do projeto disponível nesta máquina. Nenhuma variável ou log do painel de produção foi inspecionado. A ausência de credenciais nesta máquina não comprova ausência das variáveis na Vercel.
- Em 26/10/2026 (America/Manaus), capturas fornecidas pelo usuário mostraram `DATABASE_URL` da integração Neon e `BLOB_STORE_ID`/`BLOB_WEBHOOK_PUBLIC_KEY` em Production e Preview, com valores ocultos. O usuário confirmou que `BLOB_READ_WRITE_TOKEN` não aparecia. A documentação oficial atual informa que o Blob conectado usa OIDC por padrão; o SDK instalado já suporta esse modo. A aplicação ainda exigia um token estático e foi ajustada para aceitar a identidade automática, sem capturar o token nem impedir sua renovação. A consulta pública ao banco continuava retornando 503 `SERVICE_CONFIGURATION`, referência `d1d71aeb-f703-4a78-a00f-465021c6a7d9`; esse endpoint consulta somente o banco e não comprova o estado do Blob.

Na validação de 24/10, o cadastro publicado foi testado com nome, e-mail e senha exclusivamente fictícios: retornou HTTP 503, `SERVICE_CONFIGURATION`, referência `b014208e-7baf-4b0d-9695-eb1bedbab36d`. A verificação do banco retornou o mesmo código, referência `aa7a21ec-e7a2-40ff-81bf-3b29597e9037`. Esses fluxos falhavam na configuração do banco antes de usar o Blob. Não foi criada conta nem registro clínico nessa tentativa. A exceção específica da versão antiga não foi recuperada dos logs; a versão nova e o bloqueio de configuração daquela implantação foram confirmados por HTTP.

Em 26/10, após a publicação da correção OIDC, a produção passou a responder: banco pronto (200), cadastro (201), perfil (200), paciente (201), imagem privada (envio 201 e leitura 200), acesso anônimo à imagem (401), logout/login (200) e persistência dos registros na nova sessão (200). A exclusão do paciente removeu a imagem e os metadados, confirmados por respostas 404. Foram usadas somente contas e imagens artificiais de teste; as credenciais ficaram em memória. As contas técnicas fictícias permanecem, pois não existe exclusão de conta nesta etapa.

Esse teste revelou uma falha específica no relatório com imagem: o relatório sem imagem retornou 200, e com um JPEG artificial retornou 500, referência `a5d6d0f2-2c7c-4ab5-b135-d1b68c88bb5c`. A reprodução local identificou que `pdf-lib` lê o buffer de memória inteiro de um JPEG, ignorando o deslocamento de uma fatia de `Buffer`. O leitor de Blob pode retornar uma dessas fatias para imagens pequenas. A correção copia os bytes exatos para uma `Uint8Array` antes de incorporar radiografias e logotipos, preservando os arquivos e suas dimensões. O teste de regressão falhou no código anterior com `SOI not found in JPEG` e passou com a correção.

Após a implantação de `494ac24`, o teste no endereço publicado passou integralmente: relatório sem imagem e com imagem (200), documento PDF (200), perfil com logotipo (200), ficha com canal (201), agenda/status (201/200), cadastro/login (201/200) e persistência em nova sessão. A imagem continuou privada (200 autenticado, 401 anônimo). A exclusão final removeu paciente, imagem, atendimento, documento e compromisso; paciente e imagem passaram a responder 404, e as listas da conta fictícia ficaram vazias. A causa foi corrigida e o resultado foi confirmado em produção, sem usar dados reais.

## Alterações

- PostgreSQL por `DATABASE_URL`/`POSTGRES_URL`, transações com cliente reservado e migrações coordenadas entre inicializações simultâneas. SQLite local e registros antigos da versão 1 continuam suportados fora da Vercel.
- Vercel sem PostgreSQL persistente recusa a operação com `503` de configuração, em vez de gravar usuários em disco temporário.
- Sessões e contadores de autenticação ficam no banco, permitindo autenticação entre instâncias. Unicidade de e-mail também é tratada em cadastros concorrentes.
- Radiografias usam o SDK oficial de Vercel Blob com acesso privado; a identidade automática OIDC do projeto conectado e a alternativa de token estático ficam no servidor e não aparecem em DTOs. O armazenamento local é mantido no desenvolvimento e recusado na Vercel.
- Cadastro e Perfil compartilham a validação de nomes, mantendo pontos, acentos e apóstrofos. O perfil atualiza também o nome da identidade da conta.
- Respostas distinguem validação (`400`), limites (`413`/`429`), configuração/serviço (`503`) e erro inesperado (`500`). Logs usam referência e códigos seguros, sem registrar SQL, URLs de conexão, senhas ou corpos clínicos.
- O build Vercel usa o modo Next.js apropriado; o modo standalone permanece disponível para execução local e contêiner.
- O SDK Blob incluía uma versão fixa vulnerável de Zod via `@vercel/cli-config`. Um override para Zod 4.6.7 mantém a API principal 4.x e elimina essa dependência vulnerável; reavaliar o override quando o upstream atualizar a versão fixa.

## Configuração e confirmação externas

Siga [Configurar o EndoDelivery na Vercel](vercel.md). É necessário conferir/conectar PostgreSQL e Blob privado no ambiente Production, aplicar as variáveis e implantar os commits atualizados. A validação final deve criar uma conta fictícia no endereço publicado, confirmar login/logout, persistência, isolamento e acesso autorizado aos anexos/PDFs. Os resultados locais e as limitações observadas ficam em [Validação](validation.md).
