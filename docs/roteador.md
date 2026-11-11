# Roteador: menu e agendamento

Workflow `Z-Barber - roteador`, que substitui o workflow de teste. Responde ao cliente só com listas e botões do WhatsApp, sem IA.

## O que o cliente vê

```
oi
└─ Menu (lista)
   ├─ Agendar horário ── serviço (lista) ── [barbeiro, se houver mais de um] ── dia (lista)
   │                     ── período (botões Manhã/Tarde/Noite) ── horário (lista) ── Confirmar / Cancelar
   ├─ Serviços e preços ── texto com a tabela
   ├─ Endereço e horário ── texto com endereço, mapa e horário
   └─ Falar com o barbeiro ── link wa.me do número pessoal dele, com mensagem pronta
```

- O cliente pode **tocar** na opção ou **digitar o número** dela.
- Qualquer texto fora das opções responde "Não entendi" e repete a pergunta atual.
- "oi", "menu", "voltar", "bom dia" etc. sempre voltam ao menu.
- Depois de 2h sem mensagem, a conversa recomeça do menu.
- Só aparecem dias e horários livres, respeitando dias de trabalho, expediente, duração do serviço e 1h de antecedência.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `workflows/src/roteador.js` | **A lógica do bot.** Configuração (barbearia, serviços, barbeiros) no topo do arquivo. É aqui que se altera o comportamento |
| `workflows/roteador.json` | Workflow pronto para o n8n, gerado a partir do `.js`. Sem token e sem credencial |
| `scripts/gerar-roteador.ps1` | Regera o `.json` a partir do `.js` |
| `scripts/importar-roteador.ps1` | Importa no n8n local, liga a credencial, tira o workflow de teste do ar e publica |

## Como alterar e testar

1. Edite `workflows/src/roteador.js`.
2. Regere e importe:
   ```powershell
   pwsh scripts/gerar-roteador.ps1
   pwsh scripts/importar-roteador.ps1
   ```
3. Espere ~30 segundos (o n8n reinicia) e mande "oi" para o número do bot.
4. Faça commit do `.js` **e** do `.json` juntos.

Não edite o `.json` à mão nem pelo editor do n8n: a próxima geração sobrescreve. Se mudar algo no editor, leve a mudança para o `.js`.

`importar-roteador.ps1` precisa de: n8n rodando, `WHATSAPP_VERIFY_TOKEN` no `.env` (o mesmo cadastrado na Meta) e **uma** credencial Header Auth no n8n com o token da Meta.

## Como funciona por dentro

| Nó | O que faz |
|---|---|
| Webhook GET (verificacao) → Responder challenge | Validação do webhook pela Meta (`hub.challenge`) |
| Webhook POST (mensagens) | Recebe tudo que a Meta manda: mensagens e status de entrega |
| Processar mensagem | Lê a mensagem, descobre a etapa do cliente, decide a resposta e devolve uma lista de mensagens a enviar. Status de entrega são ignorados |
| Enviar ao WhatsApp | Chama `POST /{phone_number_id}/messages` uma mensagem por vez, com 400 ms entre elas, para manter a ordem |

- **Respostas fixas**: cada opção de lista ou botão tem um `id` (`srv_corte`, `dia_2026-11-12`, `hor_10:00`, `conf_sim`...). A Meta devolve esse `id` em `interactive.list_reply.id` ou `interactive.button_reply.id`. O número digitado é convertido no `id` pela ordem das opções enviadas por último.
- **Estado da conversa e reservas** ficam nos dados estáticos do workflow (`$getWorkflowStaticData`), dentro do próprio n8n. Só são gravados em execuções de produção (workflow publicado), não em testes manuais no editor.
- **Limites da Meta**: lista com no máximo 10 opções, título até 24 caracteres, descrição até 72; botões no máximo 3, título até 20.

## Provisório (próximas partes)

- Dados da barbearia **fictícios** no topo do `.js` (endereço, barbeiro "Zé", número `5521900000000`, serviços e preços). Vão para a planilha do Google.
- Reservas guardadas no n8n. Vão para a Google Agenda (uma agenda por barbeiro, com convite por e-mail ao cliente e ao barbeiro).
- Sem aviso ao barbeiro, relatório diário, lembretes de aniversário e de retorno. Dependem de templates aprovados pela Meta e de forma de pagamento na conta.
- Uma barbearia só. Para várias no mesmo número, cada barbearia precisa de um id e de um link `wa.me` próprio com texto de entrada.
