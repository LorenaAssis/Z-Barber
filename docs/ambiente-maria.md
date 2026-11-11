# Ambiente da Maria: passo a passo

Registro do que foi feito para subir uma segunda cópia do Z-Barber, com app e número da Maria, seguindo o `docs/guia-whatsapp-cloud-api-n8n.md`. Nenhum token, senha ou chave aparece aqui.

## Visão geral

```
Cliente (WhatsApp) -> Meta (Cloud API) -> túnel Cloudflare -> n8n no PC da Maria -> API da Meta -> resposta
```

| Peça | Valor | É segredo? |
|---|---|---|
| App Meta | ZeBarber-dev2 (ID `2188614388725001`) | Não |
| Portfólio empresarial | ZeBarber Dev (ID `1883526278617157`) | Não |
| Conta do WhatsApp (WABA) | ZeBarber Dev (ID `1459395302991231`) | Não |
| Número do bot | +55 21 99459-0830 (Phone number ID `1517033461487491`) | Não |
| Token da Meta | Só na credencial do n8n | **Sim** |
| Token de verificação do webhook | `WHATSAPP_VERIFY_TOKEN` no `.env` | Sim (fraco) |
| Chave do n8n | `N8N_ENCRYPTION_KEY` no `.env` | **Sim** |

## Parte 1: Meta (feito pelo navegador)

1. **Número de teste da Meta.** Funcionou para a API, mas a entrega para o Brasil falhou com o erro `130497`: a Meta bloqueia mensagens de números de fora do Brasil para números brasileiros em contas novas. Por isso usamos um número brasileiro.
2. **Dados da empresa no portfólio.** O cadastro do número foi recusado (`#2494070`, "empresa não atende às exigências") enquanto o portfólio estava com razão social, endereço, telefone e site em branco. Depois de preencher em Configurações da empresa → Informações da empresa (com o CNPJ no campo de identificação fiscal), o cadastro passou.
3. **Site.** A Meta exige um site acessível. Usamos o repositório do GitHub, que precisou ficar público (privado dá 404 para quem não está logado).
4. **Número real.** Etapa 2 do app → Registre seu número → +55 21 99459-0830. A Meta criou uma WABA nova para ele. Status final: "Conectado".

## Parte 2: Ambiente local (feito pelo terminal)

| # | O que foi feito | Por quê |
|---|---|---|
| 1 | Repositório clonado em `C:\Users\MariaClaraBazilio\Projetos\Z-Barber`, na branch `setup/ambiente-maria` | Fora do OneDrive da Owse (regra do projeto). A branch separa as mudanças da `main` |
| 2 | `.env` criado a partir do `.env.example`, com `N8N_ENCRYPTION_KEY` gerada aleatoriamente | O n8n usa essa chave para criptografar as credenciais. Se ela se perder, as credenciais salvas ficam ilegíveis |
| 3 | Docker Desktop iniciado, `docker compose up -d n8n` | Sobe o n8n em http://localhost:5678 (só acessível neste PC) |
| 4 | `docker compose --profile quick up -d cloudflared-quick` | Cria uma URL pública `https://...trycloudflare.com` que aponta para o n8n, para a Meta conseguir entregar o webhook |
| 5 | URL do túnel colocada em `N8N_WEBHOOK_URL` no `.env` e n8n reiniciado | O n8n precisa saber o endereço público para montar as URLs dos webhooks. Conferido com `<URL>/healthz` → `{"status":"ok"}` |
| 6 | Token de verificação gerado e guardado em `WHATSAPP_VERIFY_TOKEN` no `.env` | É a "senha" que a Meta manda ao validar o webhook. Não é o token da Meta |
| 7 | `workflows/whatsapp-teste.json` importado no n8n com o token de verificação no lugar de `TROQUE_O_TOKEN` (via `n8n import:workflow`) | O arquivo do repositório continua com o marcador; o token só existe no n8n local |

**A URL do túnel `quick` muda sempre que o Docker ou o túnel reiniciam.** Quando mudar, repetir o passo 5 e atualizar a URL de callback na Meta.

## Parte 3: n8n e Meta (concluído em 11/11/2026)

| # | O que foi feito | Quem | Por quê |
|---|---|---|---|
| 8 | Usuário dono criado no n8n | Maria | Acesso ao editor. Senha só com a Maria |
| 9 | Credencial **Header Auth** (`Authorization` = `Bearer <token da Meta>`) ligada ao nó **Enviar resposta** | Maria | É o que autoriza o n8n a enviar mensagens. Atenção ao espaço depois de `Bearer` |
| 10 | Workflow publicado (botão **Publish** → confirmar) | Maria | Sem publicar, o n8n responde 404 "webhook not registered". Conferido: o GET devolve o `hub.challenge` com o token certo e `token invalido` com o errado |
| 11 | Na Meta, Etapa 2 → Configurar webhooks: URL `<túnel>/webhook/whatsapp` + token de verificação → **Verificar e salvar** | Maria | A Meta chama a URL com o token e só salva se o n8n devolver o challenge |
| 12 | Campo **`messages`** assinado (a Meta assinou sozinha, junto com outros campos de conta e template) | Meta | É o campo que entrega as mensagens recebidas |
| 13 | `subscribed_apps` na WABA `1459395302991231` → `success : True` | Maria | Liga a conta do WhatsApp ao app. Sem isso a Meta não manda os POSTs ao n8n |
| 14 | Teste: "oi" de um celular para +55 21 99459-0830 → resposta "Oi! Aqui e o Ze. Voce disse: oi" | Maria | **Funcionou.** Número brasileiro, sem o erro `130497` |

### Lições

- **`Read-Host "Cole o token"`**: o texto entre aspas é a pergunta. Rode o comando sem alterar e cole o token só quando o PowerShell pedir. Se o token aparecer na tela, no chat ou no histórico, gere outro e atualize a credencial do n8n. Para limpar o histórico do PowerShell: `$h=(Get-PSReadLineOption).HistorySavePath; (Get-Content $h) | ? { $_ -notmatch 'EAA' } | Set-Content $h`.
- **Tradução automática do Chrome** troca os nomes dos nós no n8n ("Enviar resposta" vira "Certificar resposta"). Desligue a tradução na página do n8n.
- **App não publicado na Meta**: a tela avisa que webhooks de produção só chegam com o app publicado, mas o teste com o celular da administradora funcionou com o app em desenvolvimento. Publicar será necessário para clientes reais.

## Comandos úteis

```powershell
docker compose ps                                            # o que está rodando
docker compose logs cloudflared-quick | Select-String trycloudflare   # URL atual do túnel
docker compose logs -f n8n                                   # logs do n8n
docker compose --profile quick down                          # desliga tudo
```
