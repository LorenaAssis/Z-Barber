# Guia: WhatsApp Cloud API com n8n (teste com número de teste da Meta)

Para quem for reproduzir o teste do Z-Barber (pessoa ou assistente). Descreve o que foi montado, o que funcionou, o que travou e em que ordem checar.

Nenhum token, senha ou chave está neste arquivo. Onde aparece `<...>`, use o valor da sua própria conta.

## 1. Objetivo

Receber a mensagem de um cliente no WhatsApp, processar no n8n e responder, sem custo e sem IA. Este guia cobre só a conexão (receber e responder). Menu, agenda e avisos vêm depois.

```
Cliente (WhatsApp) -> Meta (Cloud API) -> túnel Cloudflare -> n8n (Docker) -> API da Meta -> resposta
```

## 2. Estado em 10/11/2026

| Etapa | Situação |
|---|---|
| n8n e túnel no ar, URL pública respondendo | Funciona |
| Meta verifica o webhook (GET) | Funciona |
| Meta entrega a mensagem real ao n8n (POST) | Funciona, depois de assinar `messages` e o `subscribed_apps` (seções 5 e 6) |
| n8n extrai a mensagem e chama a API de envio | Funciona, a API devolve o `wamid` |
| **Resposta aparece no WhatsApp do cliente** | **Não funciona.** O status de entrega volta `failed`, erro `131031` "Business Account locked" |

A causa do 131031 **não foi confirmada com a Meta**. O sinal encontrado foi "Conta restrita: antes de começar a enviar mensagens, você precisará verificar sua empresa" no Gerenciador do WhatsApp. A empresa do Z-Barber ainda não existe, então a verificação não foi iniciada.

## 3. Pré-requisitos

- Docker Desktop em execução.
- Um app no Meta for Developers com o caso de uso "Conectar-se com os clientes pelo WhatsApp", e um número de teste (a Meta oferece um).
- Anotar, na tela "Etapa 1. Experimente": o **Phone number ID** e o **ID da conta de mensagens (WABA)**. São identificadores, não segredos.
- Um token de acesso (o botão "Gerar token" dessa tela). O temporário **dura 24h**. Trate como senha.

## 4. Subir o ambiente

Na pasta do projeto:

```powershell
Copy-Item .env.example .env
docker compose up -d n8n
docker compose --profile quick up -d cloudflared-quick
docker compose logs cloudflared-quick | Select-String trycloudflare
```

1. Copie a URL `https://....trycloudflare.com` e coloque no `.env` como `N8N_WEBHOOK_URL=<URL>/` (com `/` no final).
2. Reinicie o n8n: `docker compose up -d n8n`.
3. **Aguarde cerca de 30 segundos.** Logo após reiniciar, o endereço público pode dar 404 enquanto o n8n sobe.
4. Teste de fora:
   ```powershell
   Invoke-WebRequest -UseBasicParsing "<URL>/healthz"
   ```
   Deve responder `{"status":"ok"}`.

**Atenção:** a URL do túnel `quick` **muda toda vez que o Docker ou o túnel reinicia**. Quando mudar, refaça os passos 1 a 3 e atualize o callback na Meta (seção 6).

## 5. Fluxo no n8n

O arquivo `workflows/whatsapp-teste.json` tem 5 nós:

- **Webhook GET** (`/webhook/whatsapp`) -> **Responder challenge**: devolve o `hub.challenge` se o `hub.verify_token` bater com o token de verificação.
- **Webhook POST** (`/webhook/whatsapp`) -> **Extrair mensagem** -> **Enviar resposta**: lê número, texto e Phone number ID e chama `POST https://graph.facebook.com/<versão>/<PHONE_NUMBER_ID>/messages`.

Como usar:

1. No n8n, crie um workflow novo e cole o JSON (Ctrl+V).
2. No nó **Responder challenge**, troque `TROQUE_O_TOKEN` por um token de verificação que você inventa (uma palavra qualquer). Ele **não é** o token da Meta.
3. No nó **Enviar resposta**, crie uma credencial **Header Auth**: Name `Authorization`, Value `Bearer ` (com espaço) seguido do token da Meta. Cole o token só ali.
4. Clique em **Publish**.
5. Teste a verificação pelo túnel:
   ```powershell
   Invoke-WebRequest -UseBasicParsing "<URL>/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=<SEU_TOKEN_DE_VERIFICACAO>&hub.challenge=teste123"
   ```
   Deve responder `teste123`. Se responder `token invalido`, veja a seção 8.

## 6. Webhook na Meta (incluindo "Campos do webhook")

### 6.1 URL de callback e token de verificação

Caminho: app -> **Casos de uso -> Personalizar -> Etapa 2. Configuração da produção -> Configurar webhooks**, ou a página **Webhooks** do app.

- **URL de callback:** `<URL do túnel>/webhook/whatsapp`
- **Verificar token:** o token de verificação do passo 5.2
- Clique em **Verificar e salvar**. No n8n deve aparecer uma execução GET com sucesso.

### 6.2 Campos do webhook: assinar `messages`

Esta parte é a que mais engana, e foi a causa de a mensagem real não chegar ao n8n.

1. Abra a página **Webhooks** do app (menu do caso de uso -> **Webhooks**).
2. **Troque o produto para "Whatsapp Business Account".** A página abre em **User**, que mostra campos que não têm relação com o WhatsApp (`about`, `birthday`, `friends`, ...). Preencher e salvar ali **não adianta** e cria uma configuração no produto errado.
3. Em **Campos do webhook**, procure a linha **`messages`**. Ela vem como "Cancelou a assinatura".
4. Ligue o interruptor da coluna **Assinar**. Ele mostra "Assinado" depois de alguns segundos.
5. Mantenha a versão padrão do campo (na época, v27.0).

Foi **só o `messages`** que foi assinado. Não mexemos nos demais campos. Outros que podem interessar mais tarde são os de status de template e de conta (`account_update`), mas não são necessários para este teste.

O botão **Teste**, ao lado de cada campo, manda um exemplo da Meta para a sua URL. Serve para conferir se o n8n recebe, mas o exemplo usa números de mentira.

### 6.3 Assinar o app na conta do WhatsApp (`subscribed_apps`)

Assinar o campo no app **não basta**. A conta do WhatsApp (WABA) também precisa estar assinada ao app. Sem isso, a Meta registra a mensagem só no painel de teste dela, e o n8n não recebe nenhum POST.

Rode no PowerShell. O comando pede o token na hora e não o grava no histórico:

```powershell
$t = Read-Host "Cole o token"; Invoke-RestMethod -Method Post -Uri "https://graph.facebook.com/<versão>/<WABA_ID>/subscribed_apps" -Headers @{Authorization="Bearer $t"}
```

Resposta esperada: `success : True`. Para conferir, use `-Method Get`. **Nunca use `-Method Delete`**, porque isso remove a assinatura.

## 7. Como testar e como ler o resultado

1. Do seu WhatsApp, mande "oi" para o número de teste. (O número que manda precisa estar na lista de destinatários permitidos da tela "Etapa 1".)
2. No n8n, abra o workflow -> **Executions**. Deve aparecer uma execução POST com o nó **Extrair mensagem** verde.
3. **Olhe também o evento de status**, que chega como outro POST: o payload tem `statuses[0].status` (`sent`, `delivered` ou `failed`) e, se falhou, `errors[0].code`. **O retorno do nó Enviar resposta não basta**: a API aceita o envio e a falha só aparece depois, no status.

## 8. Problemas e soluções

| Sintoma | Causa | Solução |
|---|---|---|
| Verificação devolve `token invalido` | O token da Meta foi colado no nó **Responder challenge** (ou o token de verificação não bate) | Deixe nesse nó só o token de verificação inventado. O token da Meta vai só na credencial Header Auth |
| 404 no endereço público logo após reiniciar | n8n ainda subindo, ou workflow não publicado | Espere ~30s e confirme o **Publish** |
| Meta registra o "oi" no painel de teste, mas o n8n não recebe nada | Campo `messages` desassinado, ou falta o `subscribed_apps` | Seções 6.2 e 6.3 |
| Webhook salvo, mas nada muda | Foi salvo no produto **User** | Selecione "Whatsapp Business Account" (seção 6.2) |
| Nada funciona depois de reiniciar o Docker | A URL do túnel mudou | Atualize `.env`, reinicie o n8n e refaça o callback na Meta |
| Erro de autorização ao enviar | Token expirado (temporário, 24h) | Gere um novo e atualize a credencial |
| Status `failed` com `131031` "Business Account locked" | Conta restrita (provável: empresa não verificada e sem forma de pagamento). Não confirmado | Ver seção 9 |

## 9. Se o teste de vocês também falhou: o que precisamos saber

Para descobrir a causa, responda:

1. **O que apareceu**, com o texto exato do erro ou da recusa.
2. **Em que passo parou**: verificação do webhook, recebimento (nenhum POST no n8n), execução do fluxo ou entrega no WhatsApp.
3. Se foi no envio, o **código do erro** que vem no evento de status (ex.: `131031`). Um código diferente muda o diagnóstico.
4. Foi na **mesma conta Meta** do Z-Barber ou numa **outra**?
5. A empresa estava **verificada** na Central de Segurança? Qual o status (em análise, recusada, aprovada)?
6. Em **Contas de mensagens**, a conta mostra forma de pagamento, endereço e moeda, ou "nenhum"?
7. O Gerenciador do WhatsApp mostra o aviso de **"Conta restrita"**?
8. Se a verificação foi **recusada**, qual o motivo mostrado? Causas comuns: nome ou endereço diferentes do documento, CNPJ com situação irregular, e-mail ou site que não combinam com a empresa, documento ilegível.

Informações para ter em mente:
- Número de teste serve só para teste. Para falar com clientes de verdade é preciso registrar um **número real** na conta, e esse número não pode estar ativo no app do celular.
- Para envio em produção a Meta pede **forma de pagamento**. A cobrança é por mensagem entregue, e há uma franquia mensal de mensagens de serviço.
- O que foi levantado sobre cobrança e limites vem de pesquisa e de fontes secundárias, e os valores em reais não foram confirmados na página oficial da Meta.

## 10. Segurança

- Nunca coloque token, senha ou chave em arquivo do repositório, em print ou em chat. Token fica na credencial do n8n.
- `.env` está no `.gitignore`.
- Se um token passar por lugar indevido, gere outro ("Gerar novo token") e atualize a credencial. Lembre que o token antigo pode continuar em versões antigas do workflow no n8n.
- Nunca use `DELETE` em `subscribed_apps`.
- O token de verificação do webhook não é segredo forte, mas também não reaproveite senha.
