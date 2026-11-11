// Roteador do Z-Barber: menu, informações e agendamento por listas e botões.
// Este arquivo é o código do nó "Processar mensagem" do workflow workflows/roteador.json.
// Para alterar: edite aqui e rode scripts/gerar-roteador.ps1, que regera o JSON.

// ---------- Configuração (vai para a planilha do Google na próxima parte) ----------
const CONFIG = {
  barbearia: 'ZéBarber',
  endereco: 'Rua Exemplo, 123 - Centro, Niterói/RJ',
  mapa: 'https://maps.google.com/?q=Niteroi+RJ',
  horarioTexto: 'Terça a sábado, das 9h às 19h',
  intervaloMin: 30,        // de quanto em quanto tempo começa um horário
  antecedenciaMin: 60,     // não oferece horários que começam em menos de 1h
  diasAFrente: 14,         // até quantos dias à frente é possível agendar
  expiraConversaMin: 120,  // depois disso a conversa volta ao menu
};

const SERVICOS = [
  { id: 'srv_corte', nome: 'Corte', preco: 40, duracao: 30 },
  { id: 'srv_barba', nome: 'Barba', preco: 30, duracao: 20 },
  { id: 'srv_combo', nome: 'Corte + barba', preco: 60, duracao: 50 },
  { id: 'srv_sobrancelha', nome: 'Sobrancelha', preco: 15, duracao: 10 },
];

// dias: 0 = domingo ... 6 = sábado. whatsapp: número pessoal, só dígitos, com 55 e DDD.
const BARBEIROS = [
  { id: 'bb_ze', nome: 'Zé', whatsapp: '5521900000000', dias: [2, 3, 4, 5, 6], inicio: '09:00', fim: '19:00' },
];

// ---------- Entrada ----------
const body = $input.first().json.body ?? {};
const valor = body.entry?.[0]?.changes?.[0]?.value;
const msg = valor?.messages?.[0];
if (!msg) return []; // status de entrega e outros eventos não precisam de resposta

const phoneId = valor.metadata.phone_number_id;
const cliente = msg.from;
const primeiroNome = (valor.contacts?.[0]?.profile?.name ?? '').split(' ')[0];

const dados = $getWorkflowStaticData('global');
dados.conversas ??= {};
dados.reservas ??= [];

const agora = new Date();
const expira = CONFIG.expiraConversaMin * 60 * 1000;
let conversa = dados.conversas[cliente];
if (!conversa || agora - conversa.atualizado > expira) conversa = { etapa: 'inicio' };

const texto = (msg.text?.body ?? '').trim();
let escolha = msg.interactive?.list_reply?.id ?? msg.interactive?.button_reply?.id ?? null;
if (!escolha && /^\d{1,2}$/.test(texto) && conversa.opcoes) {
  escolha = conversa.opcoes[Number(texto) - 1] ?? null; // cliente digitou o número da opção
}
const pediuMenu = /^(menu|oi|ol[aá]|in[ií]cio|voltar|bom dia|boa tarde|boa noite)\b/i.test(texto);

// ---------- Saída ----------
const saida = [];
const enviarTexto = (corpo) => saida.push({ type: 'text', text: { body: corpo, preview_url: true } });

function enviarLista(corpo, botao, linhas) {
  const numerado = linhas.map((l, i) => ({ ...l, title: l.title.slice(0, 24) }));
  saida.push({
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: corpo + '\n\n_Toque no botão abaixo ou digite o número da opção._' },
      action: { button: botao.slice(0, 20), sections: [{ title: 'Opções', rows: numerado }] },
    },
  });
  conversa.opcoes = linhas.map((l) => l.id);
}

function enviarBotoes(corpo, botoes) {
  saida.push({
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: corpo },
      action: { buttons: botoes.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } })) },
    },
  });
  conversa.opcoes = botoes.map((b) => b.id);
}

// ---------- Datas e horários ----------
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const doisDig = (n) => String(n).padStart(2, '0');
const chaveDia = (d) => `${d.getFullYear()}-${doisDig(d.getMonth() + 1)}-${doisDig(d.getDate())}`;
const rotuloDia = (d) => `${SEMANA[d.getDay()]}, ${doisDig(d.getDate())}/${doisDig(d.getMonth() + 1)}`;
const hora = (d) => `${doisDig(d.getHours())}:${doisDig(d.getMinutes())}`;
const real = (v) => `R$ ${v.toFixed(2).replace('.', ',')}`;

function noDia(chave, hhmm) {
  const [a, m, d] = chave.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  return new Date(a, m - 1, d, h, min);
}

function horariosLivres(barbeiro, chave, duracao) {
  const fim = noDia(chave, barbeiro.fim);
  const limite = new Date(agora.getTime() + CONFIG.antecedenciaMin * 60000);
  const ocupados = dados.reservas.filter((r) => r.barbeiro === barbeiro.id);
  const livres = [];
  for (let t = noDia(chave, barbeiro.inicio); t < fim; t = new Date(t.getTime() + CONFIG.intervaloMin * 60000)) {
    const termino = new Date(t.getTime() + duracao * 60000);
    if (termino > fim || t < limite) continue;
    const conflito = ocupados.some((r) => t < new Date(r.fim) && termino > new Date(r.inicio));
    if (!conflito) livres.push(t);
  }
  return livres;
}

const servicoDe = (id) => SERVICOS.find((s) => s.id === id);
const barbeiroDe = (id) => BARBEIROS.find((b) => b.id === id);

// ---------- Etapas ----------
function menu(saudacao = '') {
  conversa = { etapa: 'menu' };
  enviarLista(`${saudacao}Sou o Zé, assistente da ${CONFIG.barbearia}. Como posso ajudar?`, 'Ver opções', [
    { id: 'agendar', title: 'Agendar horário' },
    { id: 'servicos', title: 'Serviços e preços' },
    { id: 'endereco', title: 'Endereço e horário' },
    { id: 'falar', title: 'Falar com o barbeiro' },
  ]);
}

function voltarAoMenu() {
  enviarBotoes('Posso ajudar em algo mais?', [{ id: 'menu', title: 'Voltar ao menu' }]);
  conversa.etapa = 'fim';
}

function pedirServico() {
  conversa = { etapa: 'servico' };
  enviarLista('Qual serviço você deseja marcar?', 'Ver serviços',
    SERVICOS.map((s) => ({ id: s.id, title: s.nome, description: `${real(s.preco)} · ${s.duracao} min` })));
}

function pedirBarbeiro() {
  if (BARBEIROS.length === 1) {
    conversa.barbeiro = BARBEIROS[0].id;
    return pedirDia();
  }
  conversa.etapa = 'barbeiro';
  enviarLista('Com qual barbeiro?', 'Ver barbeiros', BARBEIROS.map((b) => ({ id: b.id, title: b.nome })));
}

function pedirDia() {
  const barbeiro = barbeiroDe(conversa.barbeiro);
  const duracao = servicoDe(conversa.servico).duracao;
  const linhas = [];
  for (let i = 0; i <= CONFIG.diasAFrente && linhas.length < 10; i++) {
    const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + i);
    if (!barbeiro.dias.includes(d.getDay())) continue;
    const livres = horariosLivres(barbeiro, chaveDia(d), duracao);
    if (livres.length) linhas.push({ id: `dia_${chaveDia(d)}`, title: rotuloDia(d), description: `${livres.length} horários livres` });
  }
  if (!linhas.length) {
    enviarTexto('Não encontrei horários livres nos próximos dias. 😕');
    return voltarAoMenu();
  }
  conversa.etapa = 'dia';
  enviarLista(`Qual dia fica melhor${BARBEIROS.length > 1 ? ` com o ${barbeiro.nome}` : ''}?`, 'Ver dias', linhas);
}

const PERIODOS = [
  { id: 'per_manha', title: 'Manhã', de: 0, ate: 12 },
  { id: 'per_tarde', title: 'Tarde', de: 12, ate: 18 },
  { id: 'per_noite', title: 'Noite', de: 18, ate: 24 },
];

function pedirPeriodo() {
  const livres = horariosLivres(barbeiroDe(conversa.barbeiro), conversa.dia, servicoDe(conversa.servico).duracao);
  const periodos = PERIODOS.filter((p) => livres.some((t) => t.getHours() >= p.de && t.getHours() < p.ate));
  if (periodos.length === 1) {
    conversa.periodo = periodos[0].id;
    return pedirHorario();
  }
  conversa.etapa = 'periodo';
  enviarBotoes('Prefere qual período?', periodos);
}

function pedirHorario() {
  const p = PERIODOS.find((x) => x.id === conversa.periodo);
  const livres = horariosLivres(barbeiroDe(conversa.barbeiro), conversa.dia, servicoDe(conversa.servico).duracao)
    .filter((t) => t.getHours() >= p.de && t.getHours() < p.ate)
    .slice(0, 10);
  if (!livres.length) {
    enviarTexto('Esse período acabou de ficar sem horários. Escolha outro dia.');
    return pedirDia();
  }
  conversa.etapa = 'horario';
  enviarLista('Escolha o horário:', 'Ver horários', livres.map((t) => ({ id: `hor_${hora(t)}`, title: hora(t) })));
}

function pedirConfirmacao() {
  const s = servicoDe(conversa.servico);
  const b = barbeiroDe(conversa.barbeiro);
  const d = noDia(conversa.dia, conversa.horario);
  conversa.etapa = 'confirmar';
  enviarBotoes(
    `Confere os dados:\n\n✂️ ${s.nome}\n💈 ${b.nome}\n📅 ${rotuloDia(d)} às ${conversa.horario}\n💰 ${real(s.preco)}`,
    [{ id: 'conf_sim', title: 'Confirmar' }, { id: 'conf_nao', title: 'Cancelar' }],
  );
}

function confirmar() {
  const s = servicoDe(conversa.servico);
  const b = barbeiroDe(conversa.barbeiro);
  const inicio = noDia(conversa.dia, conversa.horario);
  const ainda = horariosLivres(b, conversa.dia, s.duracao).some((t) => t.getTime() === inicio.getTime());
  if (!ainda) {
    enviarTexto('Poxa, alguém acabou de marcar esse horário. Escolha outro, por favor.');
    return pedirDia();
  }
  dados.reservas.push({
    id: `${cliente}-${inicio.getTime()}`,
    cliente,
    nome: primeiroNome,
    servico: s.id,
    barbeiro: b.id,
    inicio: inicio.toISOString(),
    fim: new Date(inicio.getTime() + s.duracao * 60000).toISOString(),
    criado: agora.toISOString(),
  });
  enviarTexto(`Agendado! ✅\n\n${s.nome} com ${b.nome}\n${rotuloDia(inicio)} às ${conversa.horario}\n\n${CONFIG.endereco}`);
  voltarAoMenu();
}

function falarComBarbeiro(b) {
  const msgPronta = encodeURIComponent(`Olá, ${b.nome}! Vim pelo WhatsApp da ${CONFIG.barbearia}.`);
  enviarTexto(`Fale direto com o ${b.nome} por aqui:\nhttps://wa.me/${b.whatsapp}?text=${msgPronta}`);
  voltarAoMenu();
}

const REPETIR = {
  menu: () => menu(),
  fim: () => menu(),
  servico: pedirServico,
  barbeiro: pedirBarbeiro,
  dia: pedirDia,
  periodo: pedirPeriodo,
  horario: pedirHorario,
  confirmar: pedirConfirmacao,
  falar: () => menu(),
};

function naoEntendi() {
  enviarTexto('Não entendi. 🤔 Escolha uma das opções:');
  (REPETIR[conversa.etapa] ?? (() => menu()))();
}

// ---------- Roteamento ----------
if (conversa.etapa === 'inicio' || (pediuMenu && !escolha)) {
  menu(primeiroNome ? `Olá, ${primeiroNome}! 👋\n` : 'Olá! 👋\n');
} else if (escolha === 'menu') {
  menu();
} else if (conversa.etapa === 'menu') {
  if (escolha === 'agendar') pedirServico();
  else if (escolha === 'servicos') {
    enviarTexto('*Serviços e preços*\n\n' + SERVICOS.map((s) => `✂️ ${s.nome}: ${real(s.preco)} (${s.duracao} min)`).join('\n'));
    voltarAoMenu();
  } else if (escolha === 'endereco') {
    enviarTexto(`📍 ${CONFIG.endereco}\n${CONFIG.mapa}\n\n🕘 ${CONFIG.horarioTexto}`);
    voltarAoMenu();
  } else if (escolha === 'falar') {
    if (BARBEIROS.length === 1) falarComBarbeiro(BARBEIROS[0]);
    else {
      conversa.etapa = 'falar';
      enviarLista('Com qual barbeiro você quer falar?', 'Ver barbeiros', BARBEIROS.map((b) => ({ id: b.id, title: b.nome })));
    }
  } else naoEntendi();
} else if (conversa.etapa === 'falar' && barbeiroDe(escolha)) {
  falarComBarbeiro(barbeiroDe(escolha));
} else if (conversa.etapa === 'servico' && servicoDe(escolha)) {
  conversa.servico = escolha;
  pedirBarbeiro();
} else if (conversa.etapa === 'barbeiro' && barbeiroDe(escolha)) {
  conversa.barbeiro = escolha;
  pedirDia();
} else if (conversa.etapa === 'dia' && escolha?.startsWith('dia_')) {
  conversa.dia = escolha.slice(4);
  pedirPeriodo();
} else if (conversa.etapa === 'periodo' && PERIODOS.some((p) => p.id === escolha)) {
  conversa.periodo = escolha;
  pedirHorario();
} else if (conversa.etapa === 'horario' && escolha?.startsWith('hor_')) {
  conversa.horario = escolha.slice(4);
  pedirConfirmacao();
} else if (conversa.etapa === 'confirmar' && escolha === 'conf_sim') {
  confirmar();
} else if (conversa.etapa === 'confirmar' && escolha === 'conf_nao') {
  enviarTexto('Tudo bem, não marquei nada.');
  voltarAoMenu();
} else {
  naoEntendi();
}

// ---------- Guardar estado e limpar dados antigos ----------
conversa.atualizado = agora.getTime();
dados.conversas[cliente] = conversa;
for (const [tel, c] of Object.entries(dados.conversas)) {
  if (agora - c.atualizado > 24 * 3600 * 1000) delete dados.conversas[tel];
}
dados.reservas = dados.reservas.filter((r) => new Date(r.fim) > agora);

return saida.map((m) => ({ json: { phone_id: phoneId, payload: { messaging_product: 'whatsapp', to: cliente, ...m } } }));
