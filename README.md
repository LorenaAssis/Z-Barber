# Z-Barber

Bot de agendamento para barbearia no WhatsApp, rodando em n8n com Google Agenda, Google Planilhas e Telegram. Tudo em serviços gratuitos.

## Estrutura

```
docker-compose.yml   n8n + túnel Cloudflare
.env.example         modelo das variáveis (copie para .env)
```

## Parte 2: n8n e túnel

### Requisitos
- Docker Desktop em execução
- PC ligado durante o expediente

### 1. Variáveis

```powershell
Copy-Item .env.example .env
```

Edite o `.env`:

- `N8N_ENCRYPTION_KEY`: gere uma chave aleatória e guarde. Se perdê-la, as credenciais salvas no n8n ficam ilegíveis.
  ```powershell
  -join ((48..57)+(97..122) | Get-Random -Count 40 | ForEach-Object {[char]$_})
  ```
- `N8N_WEBHOOK_URL`: URL pública do túnel, terminando em `/`.
- `CLOUDFLARE_TUNNEL_TOKEN`: só no modo `named`.

### 2. Subir o n8n

```powershell
docker compose up -d n8n
```

O editor abre em http://localhost:5678. O primeiro acesso pede a criação do usuário dono.

### 3. Expor o webhook

**Modo `quick`** (testes, sem domínio, URL muda a cada reinício):

```powershell
docker compose --profile quick up -d
docker compose logs cloudflared-quick | Select-String trycloudflare
```

Copie a URL `https://...trycloudflare.com`, coloque em `N8N_WEBHOOK_URL` (com `/` no final) e reinicie o n8n:

```powershell
docker compose up -d n8n
```

**Modo `named`** (produção, URL fixa):

Exige um domínio gerenciado na Cloudflare.

1. Cloudflare Zero Trust → Networks → Tunnels → criar túnel → copiar o token para `CLOUDFLARE_TUNNEL_TOKEN`.
2. Em Public Hostname: hostname `bot.seudominio.com.br`, service `http://n8n:5678`, **path `webhook/*`**. Com o path restrito, o editor do n8n não fica exposto na internet.
3. Subir:
   ```powershell
   docker compose --profile named up -d
   ```

### 4. Conferir

- `docker compose ps` mostra `zebarber-n8n` e o túnel como `running`.
- A URL pública + `webhook-test/` responde (um 404 do n8n já indica que o caminho está funcionando).

## Comandos úteis

```powershell
docker compose logs -f n8n
docker compose down
docker compose pull; docker compose up -d
```

Os dados do n8n ficam no volume `n8n_data`. Faça backup exportando os workflows pelo editor.

## Segurança

- `.env` nunca vai para o git.
- A porta 5678 só escuta em `127.0.0.1`.
- Tokens da Meta e do Telegram ficam nas credenciais do n8n, nunca em arquivos do repositório.

## Próximas partes

3. Webhook do WhatsApp e menu básico
4. Agendamento com Google Agenda
5. Avisos ao barbeiro no Telegram
6. Lista de espera e encaixes
