# Importa workflows/roteador.json no n8n local (container zebarber-n8n) e publica.
# Uso, na raiz do projeto:  pwsh scripts/importar-roteador.ps1
# Pré-requisitos: n8n rodando, WHATSAPP_VERIFY_TOKEN no .env e uma credencial Header Auth
# com o token da Meta já criada no n8n (Authorization = "Bearer <token>").

$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$container = 'zebarber-n8n'
$idRoteador = 'zbRoteador000001'

$linha = Get-Content (Join-Path $raiz '.env') | Select-String '^WHATSAPP_VERIFY_TOKEN=(.+)$'
if (-not $linha) { throw 'WHATSAPP_VERIFY_TOKEN não encontrado no .env' }
$tokenVerificacao = $linha.Matches[0].Groups[1].Value.Trim()

docker exec $container n8n export:credentials --all --output=/tmp/cred.json | Out-Null
$credenciais = docker exec $container node -e "console.log(JSON.stringify(require('/tmp/cred.json').map(c=>({id:c.id,name:c.name,type:c.type}))))" | ConvertFrom-Json
docker exec -u root $container rm -f /tmp/cred.json
$cred = @($credenciais | Where-Object type -eq 'httpHeaderAuth')
if ($cred.Count -ne 1) { throw "Esperava 1 credencial Header Auth no n8n e encontrei $($cred.Count)" }

$wf = Get-Content (Join-Path $raiz 'workflows/roteador.json') -Raw -Encoding utf8 | ConvertFrom-Json
$wf | Add-Member id $idRoteador -Force
$challenge = $wf.nodes | Where-Object name -eq 'Responder challenge'
$challenge.parameters.responseBody = $challenge.parameters.responseBody.Replace('TROQUE_O_TOKEN', $tokenVerificacao)
$envio = $wf.nodes | Where-Object name -eq 'Enviar ao WhatsApp'
$envio | Add-Member credentials ([ordered]@{ httpHeaderAuth = [ordered]@{ id = $cred[0].id; name = $cred[0].name } }) -Force

$tmp = Join-Path ([IO.Path]::GetTempPath()) 'zb-roteador.json'
$wf | ConvertTo-Json -Depth 30 | Set-Content $tmp -Encoding utf8
docker cp $tmp "${container}:/tmp/zb-roteador.json" | Out-Null
Remove-Item $tmp

# O workflow de teste usa o mesmo caminho /webhook/whatsapp, então precisa sair do ar.
$testes = docker exec $container n8n list:workflow | Where-Object { $_ -match '\|Z-Barber - webhook WhatsApp \(teste\)$' }
foreach ($t in $testes) {
  $idTeste = ($t -split '\|')[0]
  docker exec $container n8n unpublish:workflow "--id=$idTeste" 2>&1 | Out-Null
}
docker exec $container n8n import:workflow --input=/tmp/zb-roteador.json
docker exec -u root $container rm -f /tmp/zb-roteador.json
docker exec $container n8n publish:workflow --id=$idRoteador

# Reinicia para o n8n carregar a nova publicação. O túnel não reinicia, então a URL continua a mesma.
docker restart $container | Out-Null
Write-Output 'Roteador importado e publicado. Aguarde ~30s antes de testar.'
