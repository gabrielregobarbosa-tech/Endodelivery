# Privacidade, sigilo e limites da primeira etapa

O EndoDelivery trata informações clínicas potencialmente sensíveis. Esta primeira etapa é um ambiente de desenvolvimento: utilize somente contas, pacientes, documentos e imagens fictícios. As medidas descritas aqui reduzem exposição, mas não certificam conformidade com a LGPD, com normas profissionais ou prontidão para uso em produção.

## Medidas implementadas

- Contas individuais, senhas derivadas com scrypt e salt aleatório, sessões de sete dias com tokens aleatórios cujo hash é armazenado no banco.
- Cookie de sessão `HttpOnly`, `SameSite=Lax` e `Secure` em produção; conferência de origem nas requisições que alteram dados e limite persistente de tentativas de autenticação por IP e conta, compartilhado entre instâncias.
- Verificação do proprietário em pacientes, fichas, agenda, modelos, documentos, radiografias e PDFs; vínculos de outras contas são rejeitados. Chaves estrangeiras compostas reforçam o isolamento no banco.
- SQL parametrizado e limites/validação dos campos e corpos enviados.
- Radiografias fora da pasta pública, com nomes aleatórios e acesso apenas por rota autenticada. Imagens são decodificadas, normalizadas e têm metadados EXIF removidos. O caminho e o nome original não são publicados.
- Respostas clínicas com `Cache-Control: private, no-store`; o service worker armazena somente ícones públicos e uma página informativa de indisponibilidade. Não há prontuários, PDFs ou imagens disponíveis offline.
- Erros públicos sem stack traces, consultas SQL, caminhos internos, senhas ou conteúdo clínico. Nenhuma credencial padrão é instalada.
- Compartilhamento de PDF acionado pelo usuário com os recursos do dispositivo; o servidor não envia automaticamente documentos a serviços de mensagens.

Localmente, dados e arquivos persistem em `DATABASE_PATH` e `FILE_STORAGE_PATH`. Na Vercel, o aplicativo exige PostgreSQL gerenciado e Blob privado; credenciais ficam nas variáveis seguras da plataforma e nunca chegam ao cliente. As pastas locais `data`, arquivos `.env` e relatórios temporários de testes não devem ser versionados. Uploads não podem ficar sob `public`. A aplicação não implementa cifragem própria em repouso: proteção de serviços, volumes, snapshots e backups depende da infraestrutura e dos contratos com os provedores.

## O que ainda não existe

Nesta etapa, não há verificação de e-mail, recuperação automática de senha, MFA, administração de equipes/papéis, trilha completa de auditoria clínica, assinatura digital de documentos, política automatizada de retenção, backup automatizado ou recuperação de desastre validada. O cadastro é autônomo; não comprova identidade ou inscrição profissional. Sessões diferentes do mesmo usuário não têm ainda uma tela de revogação centralizada.

O limite de autenticação persiste no banco e usa identificadores derivados por hash, com limpeza de janelas expiradas. O proxy precisa sobrescrever cabeçalhos de IP para evitar falsificação desses identificadores. A política CSP inicial deve ser refinada em uma revisão de implantação. O aplicativo não controla o armazenamento posterior de PDFs baixados, a galeria do dispositivo, capturas de tela, extensões do navegador ou os destinos escolhidos no compartilhamento.

O objetivo do produto é registrar informações inseridas pelo profissional. Não há diagnóstico, sugestão automática de conduta ou prescrição medicamentosa. Modelos de receituário e orientações precisam de revisão e preenchimento individual pelo profissional responsável.

## Antes de qualquer uso com dados reais

É necessário planejar e validar, no mínimo:

1. **Responsabilidade e finalidade:** identificar controlador e operadores, bases legais aplicáveis aos dados de saúde, finalidades, transparência ao paciente, contratos com fornecedores e procedimentos de atendimento dos direitos dos titulares. Consentimento não deve ser presumido como a única base legal.
2. **Implantação:** domínio HTTPS, `APP_ORIGIN` explícito, volumes persistentes privados, permissões mínimas de acesso, proteção/cifragem em repouso fornecida pela infraestrutura e segregação entre desenvolvimento e produção. Nunca colocar o banco ou uploads em pastas estáticas ou armazenamento público.
3. **Autenticação e acesso:** política de acesso profissional, verificação de conta, recuperação segura, MFA quando aplicável, revisão de sessões, controles para equipes e monitoramento de abuso. O proxy deve sobrescrever cabeçalhos de IP fornecidos pelo cliente; múltiplas instâncias exigem limite compartilhado e estratégia apropriada de banco/arquivos.
4. **Backups e continuidade:** backups cifrados e restritos de banco e uploads, obtidos de forma consistente. Considere o modo WAL do SQLite; copiar apenas o arquivo principal enquanto ele está em uso não garante um backup consistente. Defina retenção, restauração, verificação periódica e tratamento dos backups após pedidos de exclusão.
5. **Prontuário e retenção:** definir regras compatíveis com legislação e obrigações profissionais, inclusive orientações do CFO aplicáveis. A exclusão disponível na interface é permanente e pode remover fichas, documentos e radiografias vinculadas; deve ser usada somente com dados fictícios até existir uma política clínica revisada de guarda, correção, exportação e descarte. Não apague prontuários reais apenas por haver um botão de exclusão.
6. **Auditoria e incidentes:** implementar registros de acesso/alteração adequados, preservação de evidências sem exposição desnecessária, processo de resposta e avaliação de comunicação de incidentes, responsáveis e canais de suporte.
7. **Dispositivos e compartilhamento:** orientar bloqueio de tela, atualização do sistema, contas individuais e verificação do destinatário. PDFs contêm dados clínicos; enviá-los por WhatsApp ou outro canal exige avaliação de sigilo, finalidade, legitimidade do destinatário e políticas do serviço.
8. **Revisão técnica:** executar testes de autorização e segurança, revisar dependências, política CSP, configuração de proxies e cache, limites de armazenamento, concorrência e capacidade. Validar o Safari/iPhone real e o comportamento do compartilhamento nativo em HTTPS.

## Operação em desenvolvimento

Crie uma conta fictícia sem reutilizar senhas pessoais. Teste isolamento com duas contas distintas. Não envie radiografias reais nem imagens que contenham nomes, identificação ou metadados pessoais. Mesmo com remoção de EXIF, identificação pode estar visível nos pixels; a normalização da imagem não anonimiza seu conteúdo.

Antes de publicar um snapshot de ambiente, remover a aplicação ou compartilhar relatórios de teste, confira quais arquivos locais serão retidos. Snapshots também podem conter banco e uploads. Remova apenas os dados de teste que criou e respeite arquivos preexistentes. Não publique `data/`, cookies, capturas com credenciais ou arquivos `.env` no Git.

Na produção futura, exportação e descarte precisam considerar registros vinculados, arquivos privados, cópias locais e backups. Uma resposta HTTP de exclusão não comprova remoção de cópias existentes em dispositivos ou terceiros. A aplicação atual não oferece garantia de eliminação segura de todas as cópias.
