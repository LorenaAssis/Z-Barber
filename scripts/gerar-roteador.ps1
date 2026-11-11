# Gera workflows/roteador.json a partir de workflows/src/roteador.js.
# Uso, na raiz do projeto:  pwsh scripts/gerar-roteador.ps1
# O JSON gerado não tem token nem credencial: isso é configurado no n8n de cada pessoa.

$raiz = Split-Path $PSScriptRoot -Parent
$codigo = Get-Content (Join-Path $raiz 'workflows/src/roteador.js') -Raw -Encoding utf8

$workflow = [ordered]@{
  name  = 'Z-Barber - roteador'
  nodes = @(
    [ordered]@{
      parameters  = [ordered]@{ path = 'whatsapp'; responseMode = 'responseNode'; options = @{} }
      name        = 'Webhook GET (verificacao)'
      type        = 'n8n-nodes-base.webhook'
      typeVersion = 2
      position    = @(0, 0)
      webhookId   = 'b6f1c0d2-1a2b-4c3d-8e9f-zebarber0101'
    },
    [ordered]@{
      parameters  = [ordered]@{
        respondWith  = 'text'
        responseBody = "={{ `$json.query['hub.verify_token'] === 'TROQUE_O_TOKEN' ? `$json.query['hub.challenge'] : 'token invalido' }}"
        options      = @{}
      }
      name        = 'Responder challenge'
      type        = 'n8n-nodes-base.respondToWebhook'
      typeVersion = 1.1
      position    = @(260, 0)
    },
    [ordered]@{
      parameters  = [ordered]@{ httpMethod = 'POST'; path = 'whatsapp'; options = @{} }
      name        = 'Webhook POST (mensagens)'
      type        = 'n8n-nodes-base.webhook'
      typeVersion = 2
      position    = @(0, 240)
      webhookId   = 'b6f1c0d2-1a2b-4c3d-8e9f-zebarber0102'
    },
    [ordered]@{
      parameters  = [ordered]@{ jsCode = $codigo }
      name        = 'Processar mensagem'
      type        = 'n8n-nodes-base.code'
      typeVersion = 2
      position    = @(260, 240)
    },
    [ordered]@{
      parameters  = [ordered]@{
        method          = 'POST'
        url             = '=https://graph.facebook.com/v25.0/{{ $json.phone_id }}/messages'
        authentication  = 'genericCredentialType'
        genericAuthType = 'httpHeaderAuth'
        sendBody        = $true
        specifyBody     = 'json'
        jsonBody        = '={{ JSON.stringify($json.payload) }}'
        options         = [ordered]@{ batching = @{ batch = [ordered]@{ batchSize = 1; batchInterval = 400 } } }
      }
      name        = 'Enviar ao WhatsApp'
      type        = 'n8n-nodes-base.httpRequest'
      typeVersion = 4.2
      position    = @(520, 240)
    }
  )
  connections = [ordered]@{
    'Webhook GET (verificacao)' = @{ main = @(, @(@{ node = 'Responder challenge'; type = 'main'; index = 0 })) }
    'Webhook POST (mensagens)'  = @{ main = @(, @(@{ node = 'Processar mensagem'; type = 'main'; index = 0 })) }
    'Processar mensagem'        = @{ main = @(, @(@{ node = 'Enviar ao WhatsApp'; type = 'main'; index = 0 })) }
  }
  settings = @{ executionOrder = 'v1' }
}

$saida = Join-Path $raiz 'workflows/roteador.json'
$workflow | ConvertTo-Json -Depth 30 | Set-Content $saida -Encoding utf8
Write-Output "Gerado: $saida"
