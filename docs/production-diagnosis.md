# Cadastro e persistência na Vercel

## Evidência disponível

- O commit inicial `213b426` abria SQLite em `process.cwd()/data/endodelivery.sqlite` durante o cadastro, criava diretórios e executava migrações síncronas. Não havia conexão PostgreSQL nem adaptador de armazenamento remoto.
- Esse fluxo depende de disco local persistente. O filesystem da aplicação em funções serverless da Vercel não oferece essa garantia; `/tmp` não é persistência clínica e não foi usado como correção.
- O nome profissional já aceitava pontuação no cadastro inicial. Uma mensagem genérica de erro não demonstra que pontos ou acentos eram a causa da falha. Havia, porém, perda de caracteres fora de WinAnsi na exportação PDF, corrigida com fontes Unicode.
- As consultas desta sessão ao domínio publicado foram bloqueadas pelo proxy de rede com `CONNECT ... 403`, antes de obter uma resposta da aplicação. Isso não é um HTTP 403 observado no EndoDelivery.
- Não havia autenticação Vercel ou arquivo de vínculo do projeto disponível nesta máquina. Nenhuma variável ou log do painel de produção foi inspecionado. A ausência de credenciais nesta máquina não comprova ausência das variáveis na Vercel.

Portanto, foi identificada e corrigida uma incompatibilidade concreta no código, mas a exceção específica do deploy original e o funcionamento do cadastro publicado ainda exigem logs/acesso à implantação. Não se deve declarar a produção corrigida com base somente nos testes locais.

## Alterações

- PostgreSQL por `DATABASE_URL`/`POSTGRES_URL`, transações com cliente reservado e migrações coordenadas entre inicializações simultâneas. SQLite local e registros antigos da versão 1 continuam suportados fora da Vercel.
- Vercel sem PostgreSQL persistente recusa a operação com `503` de configuração, em vez de gravar usuários em disco temporário.
- Sessões e contadores de autenticação ficam no banco, permitindo autenticação entre instâncias. Unicidade de e-mail também é tratada em cadastros concorrentes.
- Radiografias usam o SDK oficial de Vercel Blob com acesso privado; o token fica no servidor e não aparece em DTOs. O armazenamento local é mantido no desenvolvimento e recusado na Vercel.
- Cadastro e Perfil compartilham a validação de nomes, mantendo pontos, acentos e apóstrofos. O perfil atualiza também o nome da identidade da conta.
- Respostas distinguem validação (`400`), limites (`413`/`429`), configuração/serviço (`503`) e erro inesperado (`500`). Logs usam referência e códigos seguros, sem registrar SQL, URLs de conexão, senhas ou corpos clínicos.
- O build Vercel usa o modo Next.js apropriado; o modo standalone permanece disponível para execução local e contêiner.
- O SDK Blob incluía uma versão fixa vulnerável de Zod via `@vercel/cli-config`. Um override para Zod 4.6.7 mantém a API principal 4.x e elimina essa dependência vulnerável; reavaliar o override quando o upstream atualizar a versão fixa.

## Configuração e confirmação externas

Siga [Configurar o EndoDelivery na Vercel](vercel.md). É necessário conferir/conectar PostgreSQL e Blob privado no ambiente Production, aplicar as variáveis e implantar os commits atualizados. A validação final deve criar uma conta fictícia no endereço publicado, confirmar login/logout, persistência, isolamento e acesso autorizado aos anexos/PDFs. Os resultados locais e as limitações observadas ficam em [Validação](validation.md).
