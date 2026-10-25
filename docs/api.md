# API do EndoDelivery — primeira etapa

A aplicação web e as rotas REST fazem parte do mesmo servidor Next.js, sob `/api`. O servidor requer Node.js 24 e usa PostgreSQL gerenciado na Vercel ou SQLite local em `DATABASE_PATH`, com migrações idempotentes. Os nomes dos campos são `snake_case`; identificadores são UUIDs e datas civis usam `AAAA-MM-DD`. Horários da agenda usam `HH:mm`, sem conversão automática de fuso horário.

Esta API pode ser consumida por um futuro cliente SwiftUI. Não há aplicativo nativo, autenticação OAuth nem contrato de compatibilidade versionado nesta etapa.

## Sessão e segurança das requisições

O cadastro cria a conta, o perfil profissional e dois modelos editáveis de documentos. Não existe conta administrativa ou senha padrão. O e-mail é normalizado para minúsculas e a senha precisa ter de 10 a 128 caracteres.

Senhas são derivadas com scrypt (`N=131072`, `r=8`, `p=1`), salt aleatório de 16 bytes e comparação em tempo constante. O cookie `endodelivery_session` contém um token aleatório; somente seu hash SHA-256 é persistido. A sessão expira após sete dias. O cookie é `HttpOnly`, `SameSite=Lax`, `Path=/` e `Secure` quando `NODE_ENV=production`. Faça deploy de produção exclusivamente com HTTPS.

Os endpoints clínicos exigem sessão. Consultas e alterações verificam o proprietário; tentar acessar uma entidade de outra conta retorna `404`. IDs recebidos do cliente nunca substituem o proprietário derivado da sessão.

Requisições que alteram estado rejeitam `Sec-Fetch-Site: cross-site` e, quando enviado, verificam o cabeçalho `Origin`. Defina `APP_ORIGIN=https://seu-dominio.example` em produção; localmente, a origem da própria requisição é usada. Clientes nativos podem enviar cookies sem `Origin`. Não há configuração de CORS para chamadas de outros sites.

Login admite até 20 tentativas e cadastro até oito por janela de 15 minutos e IP. No login, há também limite persistente de 20 tentativas por e-mail. Os contadores atômicos ficam no banco e são compartilhados entre instâncias, com identificadores derivados por hash. Um proxy de produção deve sobrescrever cabeçalhos de IP encaminhados, sobretudo `X-Forwarded-For` e `X-Real-IP`; clientes não devem poder escolhê-los.

## Formato e limites

- Requisições JSON precisam de `Content-Type: application/json` e objeto na raiz. Limite total: 2 MiB, verificado durante a leitura.
- Respostas de erro têm `error` em português, sem stack trace ou detalhes de SQL. Falhas operacionais também incluem `code` e `reference` para correlação com logs seguros.
- Respostas clínicas, radiografias e PDFs usam `Cache-Control: private, no-store`. Não devem ser armazenadas por CDN, proxy ou service worker.
- `400`: dados inválidos; `401`: sessão ausente/expirada; `403`: origem rejeitada; `404`: recurso indisponível; `413`: tamanho excedido; `415`: JSON enviado com tipo de conteúdo incorreto; `422`: glifo de identidade ainda não suportado pelo PDF; `429`: limite de autenticação; `503`: configuração ou serviço indisponível; `500`: falha interna genérica.
- Criações retornam `201`. Exclusão de modelo ou documento retorna `204`, sem corpo; exclusão de paciente/atendimento/compromisso/radiografia retorna JSON.

Os exemplos abaixo são fictícios e não correspondem a contas ou pacientes instalados.

## Autenticação e prontidão

| Método e rota | Corpo ou resultado |
| --- | --- |
| `POST /api/auth/register` | `{ "name", "email", "password" }` → `{ "user": { "id", "name", "email" } }` e cookie |
| `POST /api/auth/login` | `{ "email", "password" }` → `{ "user" }` e cookie |
| `POST /api/auth/logout` | Invalida a sessão atual → `{ "ok": true }` |
| `GET /api/auth/me` | `{ "user" }` da sessão atual |
| `GET /api/health` | Sem autenticação. Consulta o banco e as migrações → `{ "status": "ok", "database": "ready", "max_upload_bytes": 10485760 }` localmente; o limite é 4194304 na Vercel. Indisponível retorna `503`; não comprova acesso ao Blob. |

Exemplo de cadastro de uma conta de desenvolvimento:

```json
{
  "name": "Dra. Marina Exemplo",
  "email": "marina@example.test",
  "password": "senha-ficticia-apenas-testes"
}
```

## Pacientes e atendimentos

| Método e rota | Comportamento |
| --- | --- |
| `GET /api/patients?q=Exemplo` | Lista `{ "patients": [...] }`; pesquisa por nome ou profissional indicador, incluindo `visit_count` e `last_visit` |
| `POST /api/patients` | Cria paciente → `{ "patient" }` |
| `GET /api/patients/:id` | `{ "patient", "visits": [...], "radiographs": [...], "documents": [...] }` |
| `PATCH /api/patients/:id` | Atualiza os campos enviados → `{ "patient" }` |
| `DELETE /api/patients/:id` | Exclui paciente e registros vinculados, incluindo imagens privadas; requer confirmação na interface |
| `POST /api/patients/:id/visits` | Registra ficha clínica → `{ "visit" }` |
| `PATCH /api/visits/:id` | Atualiza campos da ficha, preservando os omitidos |
| `DELETE /api/visits/:id` | Exclui ficha e radiografias vinculadas a ela |
| `GET /api/patients/:id/report` | PDF do histórico clínico com cabeçalho profissional, fichas por atendimento e radiografias/legendas |

Paciente: `name` é obrigatório (até 160 caracteres). `referring_professional`, `birth_date`, `phone` e `notes` são opcionais. A data do atendimento e o elemento dentário ficam na ficha, permitindo múltiplos atendimentos por paciente.

```json
{
  "name": "Paciente Fictício",
  "referring_professional": "Dr. Indicador Exemplo",
  "birth_date": "1988-05-20",
  "phone": "",
  "notes": "Cadastro exclusivamente para testes."
}
```

Ficha clínica: `attended_at`, `tooth` e `treatment` são obrigatórios. `canals` admite até 16 entradas, cada uma com nome, odontometria e LAF em texto livre. O aplicativo registra informações fornecidas pelo profissional; não recomenda diagnóstico, medicação ou conduta.

```json
{
  "attended_at": "2026-10-24",
  "tooth": "36",
  "treatment": "Descrição fictícia de tratamento para teste do sistema.",
  "cement": "Material de teste",
  "irrigant": "Informação fictícia",
  "notes": "Não corresponde a um atendimento real.",
  "canals": [
    { "name": "MV", "odontometry": "20 mm (exemplo)", "laf": "35 (exemplo)" }
  ]
}
```

## Radiografias privadas

| Método e rota | Comportamento |
| --- | --- |
| `POST /api/patients/:id/radiographs` | `multipart/form-data` com `file`, `caption` opcional e `visit_id` opcional → `{ "radiograph" }` |
| `GET /api/radiographs/:id` | Imagem JPEG autenticada do proprietário |
| `DELETE /api/radiographs/:id` | Remove a imagem e seu registro |

Cada arquivo pode ter até 10 MiB localmente ou 4 MiB na Vercel, e até 20 megapixels. O parser admite até 128 KiB adicionais para o envelope multipart. JPEG, PNG e WebP estáticos são decodificados e normalizados para JPEG; o tipo real é validado pelo decodificador. EXIF, localização e nome original não são preservados. Não há suporte a DICOM, HEIC ou animação.

Os arquivos recebem nomes aleatórios e ficam no Blob Store privado na Vercel ou em `FILE_STORAGE_PATH` localmente, fora de `public`; metadados retornados ao cliente não incluem caminhos internos, URLs de objetos ou tokens. `visit_id`, quando informado, precisa pertencer ao mesmo paciente e usuário. Legendas admitem até 500 caracteres.

## Agenda

| Método e rota | Comportamento |
| --- | --- |
| `GET /api/appointments?date=2026-10-24` | `{ "appointments": [...] }`, com `patient_name`; sem `date`, lista todos os compromissos da conta |
| `POST /api/appointments` | Cria compromisso → `{ "appointment" }` |
| `PATCH /api/appointments/:id` | Atualiza campos enviados, incluindo status |
| `DELETE /api/appointments/:id` | Exclui compromisso |

```json
{
  "patient_id": "f0000000-0000-4000-8000-000000000001",
  "date": "2026-10-24",
  "time": "09:30",
  "clinic": "Clínica Fictícia",
  "procedure": "Atendimento de teste",
  "status": "scheduled"
}
```

O vínculo `patient_id` é opcional (`null` ou string vazia também são aceitos). Data, horário, clínica e procedimento são obrigatórios.

| Valor da API | Nome na interface |
| --- | --- |
| `scheduled` | Agendado |
| `in_progress` | Em atendimento |
| `completed` | Concluído |
| `cancelled` | Cancelado |

## Perfil profissional

`GET /api/profile` retorna `{ "profile" }`. `PUT /api/profile` salva o perfil completo e retorna a mesma estrutura. O nome profissional é obrigatório, com 2 a 120 caracteres, e preserva pontuação e Unicode, assim como o cadastro; enviar os demais campos vazios remove seu conteúdo.

```json
{
  "name": "Dra. Marina Exemplo",
  "specialty": "Endodontia",
  "cro": "AM-00000 (fictício)",
  "phone": "",
  "email": "marina@example.test",
  "address": "Endereço fictício para testes",
  "logo_data_url": ""
}
```

`logo_data_url` aceita uma data URL base64 PNG ou JPEG de até 1 MiB decodificado e 16 megapixels. A imagem é normalizada, redimensionada a no máximo 1024×1024 e tem metadados removidos. O perfil é inserido no cabeçalho dos PDFs gerados; mudanças posteriores aparecem nas novas gerações. Os PDFs não são assinados digitalmente.

## Modelos e documentos

| Método e rota | Comportamento |
| --- | --- |
| `GET /api/templates` | `{ "templates": [...] }` |
| `POST /api/templates` | Cria modelo reutilizável → `{ "template" }` |
| `GET /api/templates/:id` | `{ "template" }` |
| `PATCH /api/templates/:id` | Edita título, tipo ou conteúdo |
| `DELETE /api/templates/:id` | Remove o modelo, preservando o conteúdo dos documentos já emitidos |
| `GET /api/documents?patient_id=:id` | `{ "documents": [...] }`; filtro por paciente opcional |
| `POST /api/documents` | Salva o texto final editado → `{ "document" }` |
| `GET /api/documents/:id` | `{ "document" }` |
| `PATCH /api/documents/:id` | Atualiza campos enviados; referências omitidas são preservadas |
| `DELETE /api/documents/:id` | Remove o documento salvo |
| `GET /api/documents/:id/pdf` | PDF com conteúdo salvo, paciente opcional e cabeçalho profissional |

Modelos usam `title` (até 160 caracteres), `kind` (`prescription` ou `post_op`) e `content` (até 30.000 caracteres). Documentos usam os mesmos campos, mais `patient_id` e `template_id` opcionais/nulos, sempre da conta autenticada. O texto é tratado como texto simples, não HTML.

```json
{
  "title": "Recomendações de teste",
  "kind": "post_op",
  "content": "Paciente: {{paciente}}\nData: {{data}}\n\n[Orientações fictícias a revisar pelo profissional.]\n\n{{profissional}} — CRO {{cro}}",
  "patient_id": "f0000000-0000-4000-8000-000000000001",
  "template_id": null
}
```

Na criação de documentos, os placeholders restantes `{{paciente}}`, `{{profissional}}`, `{{cro}}` e `{{data}}` são preenchidos com dados autorizados. `{{data}}` usa a data em português no fuso `America/Manaus`. Salvar uma edição posterior não reaplica placeholders. Os modelos iniciais são campos orientativos vazios, sem prescrição clínica automática.

PDFs são gerados sob demanda, retornados como `application/pdf` com `Content-Disposition: attachment` e não publicados em URL pública. No Safari compatível, a interface pode abrir o compartilhamento nativo de arquivos; o usuário escolhe WhatsApp ou outro destino. O aplicativo não envia arquivos ao WhatsApp por conta própria. O usuário pode baixar o PDF quando o compartilhamento nativo não estiver disponível.
