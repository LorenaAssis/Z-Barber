# Histórico do projeto Z-Barber

Bot de agendamento para barbearia no WhatsApp, todo em serviços gratuitos. Repositório: https://github.com/LorenaAssis/Z-Barber

Ao retomar o trabalho, ler este arquivo primeiro.

## Estado atual (04/11/2026)

- Arquitetura definida (abaixo).
- Parte 2 criada: `docker-compose.yml`, `.env.example`, `.gitignore`, `README.md`. O compose foi validado com `docker compose config`; os containers ainda não foram iniciados.
- Repositório local criado com `git init` e `origin` apontando para o GitHub. O clone falhou por falta de autenticação, então nada foi commitado nem enviado. O push precisa ser feito pela Lorena, com o login dela. Se o repo remoto já tiver commit inicial, rodar antes `git pull origin main --allow-unrelated-histories`.
- Parte 1 (Meta): a Maria está criando o portfólio empresarial. Ela parou no formulário "Criar portfólio empresarial" (nome do portfólio, nome, sobrenome, e-mail comercial). Preenchimento combinado para o teste: portfólio `ZeBarber` (sem caracteres especiais, a Meta não aceita acento), nome e sobrenome da administradora inicial, e e-mail comercial que a barbearia ou a Lorena controle (o Yahoo pessoal da Maria só serve para teste). Depois de criar, adicionar a Lorena como administradora em Configurações da empresa → Pessoas, para a conta não depender só da Maria.
- `.env` criado localmente (fora do git) com chave de criptografia do n8n gerada e `N8N_WEBHOOK_URL=http://localhost:5678/` para teste. O n8n subiu em 04/11/2026 (`docker compose up -d n8n`, container `zebarber-n8n`, health check local `ok`, editor em http://localhost:5678, porta presa em 127.0.0.1). A Lorena criou o usuário dono com o e-mail pessoal dela, só para teste (sem SMTP, então não há reset de senha por e-mail). Avisos nos logs, sem impacto: `WEBHOOK_URL` obsoleto (usar `N8N_WEBHOOK_URL`), task runner interno obsoleto e runner de Python indisponível. O túnel ainda não foi testado.

## Arquitetura

Fluxo: Cliente → WhatsApp Cloud API (Meta) → Cloudflare Tunnel → n8n self-hosted no PC da barbearia → Google Agenda, Google Planilhas e Telegram.

| Peça | Função | Custo |
|---|---|---|
| WhatsApp Cloud API | Recebe e envia mensagens, com botões e listas | Responder ao cliente em até 24h é grátis. Template (lembrete) é cobrado por mensagem |
| Cloudflare Tunnel | URL pública HTTPS para o webhook | Grátis |
| n8n self-hosted | Menu, regras, horários livres, avisos | Grátis, PC ligado no expediente |
| Google Agenda | Uma agenda por barbeiro, fonte única dos agendamentos | Grátis |
| Google Planilhas | Config, estado da conversa, lista de espera | Grátis |
| Telegram | Avisos ao barbeiro (novo agendamento, resumo das 8h) | Grátis |

### Os 3 fluxos do n8n

1. **Roteador**: recebe o webhook, lê o estado do cliente na planilha, responde menus simples (preços, endereço, horário), passa para o agendamento ou avisa o dono se pedir atendente.
2. **Agendamento**: serviço → barbeiro → dia → horário → confirmar. Lê serviços e horários na planilha, consulta a Google Agenda, valida expediente e conflito, e só cria o evento depois do "confirmo".
3. **Rotinas** (por horário): resumo diário às 8h por barbeiro no Telegram; oferecer horário vago à lista de espera quando houver cancelamento.

### Abas da planilha

| Aba | Colunas |
|---|---|
| Servicos | nome, preço, duração (min) |
| Barbeiros | nome, id da agenda, dias e horários de trabalho, chat do Telegram |
| Estado | telefone, etapa atual, escolhas já feitas |
| Fila | telefone, barbeiro, data desejada |

O estado expira depois de algumas horas e a conversa volta ao menu.

## Decisões

- **Sem IA nesta versão.** Tudo por botões e listas, sem gasto com token. Texto não entendido devolve o menu. Se ligar depois: Haiku 5.5 (`claude-haiku-5-5`), com `effort: low`, histórico curto e teto de US$ 5/mês no console da Anthropic. O bot grava na agenda; a IA só estrutura o pedido.
- **Aviso ao barbeiro pelo Telegram**, porque mensagem iniciada pela empresa no WhatsApp exige template pago.
- **Lembrete ao cliente 1 dia antes fica fora do plano grátis** (template pago). Alternativas: lembrete nativo da Google Agenda por e-mail, ou nenhum no início.
- **Preço do WhatsApp:** a Meta passou a cobrar por mensagem em 2025, então a antiga franquia de 1.000 conversas grátis não vale mais. Confirmar na página de preços da Meta.
- **Encaixes:** quem decide é o barbeiro. Opções combinadas: janelas de encaixe reservadas na agenda, lista de espera automática e fluxo em que o bot pergunta ao barbeiro. A validação de horário é sempre feita no n8n, nunca pela IA.
- **Túnel:** modo `quick` (grátis, sem domínio, URL muda a cada reinício, só para testes) e modo `named` (URL fixa, exige domínio na Cloudflare, cerca de R$ 40 por ano). No `named`, restringir o path a `webhook/*` para não expor o editor do n8n.
- **Meta:** para desenvolver basta o número de teste da Meta e o token temporário de 24h. Número real, token permanente e verificação da empresa só no go-live.
- **n8n** self-hosted foi escolhido em vez de Typebot. Typebot ficou como alternativa se montar a conversa no n8n ficar ruim.

## Nome e marca

- Nome do repo: Z-Barber. Nome falado do bot: "Zé". Preferência de grafia: ZéBarber, sem hífen, por causa de @, domínio e URL.
- Antes de adotar como marca: pesquisar Instagram, Google Maps, registro.br e INPI.
- Logo: três rascunhos feitos (poste de barbeiro, monograma Z, tesoura). O monograma Z em círculo serve de foto de perfil do WhatsApp. Assunto adiado.

## Plano por partes

1. Meta: app, número de teste, token (Lorena). Anotar Phone number ID e WhatsApp Business Account ID. Não colar token no chat.
2. n8n e túnel (feito, falta subir e testar).
3. Webhook do WhatsApp e menu básico.
4. Agendamento com Google Agenda.
5. Avisos ao barbeiro no Telegram.
6. Lista de espera e encaixes.

## Pendências

- Lorena concluir a Parte 1 e confirmar se já tem conta Meta Business e qual número o bot usará.
- Subir o n8n (`docker compose up -d n8n`), criar o usuário dono e testar o túnel.
- Fazer o primeiro commit e o push.
- Definir o nome real da barbearia para as mensagens de boas-vindas.
- Decidir entre túnel `quick` (só teste) e domínio próprio para o `named`.

## Regras de trabalho

- Não disparar requisições a sites externos nem rodar automação sem a Lorena presente.
- Não editar arquivos existentes sem pedido explícito dela.
- Sem comentários sobre IA nos arquivos e sem linha de co-autoria nos commits.
- Dados deste projeto ficam fora do OneDrive da Owse.
