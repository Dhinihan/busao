# Plano · Idade mínima para substituir a sessão no DB (rev. 4)

Rev. 4 registra a **Etapa 0 executada** (24/08): o probe em capsule descartável
mediu **mundo (b)** — ler→checar→gravar não é atômico no runtime v0.0.29;
escritores simultâneos leem a linha velha e gravam juntos (~2 escapes em
rajada de 10, ~4 em 25, com 500 de lock timeout aparecendo no patamar alto).
Números completos em `docs/lakebed.md`.

**Decisão com desvio declarado**: a letra da R3 mandava, no mundo (b), remover
a guarda e decidir CAS à parte. Os dados mostraram um meio que R3 não
previra: a guarda contém a maior parte da rajada (÷5 medido) sem introduzir
500 novo no patamar realista (k ≤ 10 ⇒ zero). Mantê-la domina o master em
todos os eixos medidos; a promessa de teto mecânico (720/dia) está **retirada**
— a guarda é contenção parcial, e a projeção de cota usa o pior caso medido.
Delta = 1 continua exigindo CAS, registrado como escalada condicionada a
pressão real de cota, não como trabalho atual.

## Problema (residual, pós-2547a13)

O poll sequencial por dispositivo já tampa o caso conhecido. Sobram três
caminhos que ainda produzem rajada de escrita sobre a mesma chave:

- múltiplos dispositivos cujos polls sincronizam sobre um cookie morto
  (população atual ~10 usuários ⇒ até ~10 logins+escritas por morte);
- regressão ou bug futuro no cliente — o limite atual vive inteiro no
  dispositivo;
- qualquer caminho de escrita novo no servidor, que nasce sem guarda.

A cota é 1.000/dia e cada estouro derruba o deploy inteiro (429 universal,
inclusive `/api/status`).

## A pergunta que decidia o desenho — RESPONDIDA (Etapa 0, 24/08)

O probe em capsule descartável (semeadura + espera 2,6 s + K POSTs paralelos,
distribuição por request) mediu:

| Rajada | Escritas | Recusas | 500 |
|---|---|---|---|
| k=10 ×3 | 2/2/2 | 8 cada | 0 |
| k=25 ×2 | 4/4 | 19, 21 | 2, 0 |

**Mundo (b) confirmado.** O estouro de 24/08 não distinguia os mundos (cookies
todos diferentes, dedup por valor jamais atuaria); o probe sim. Detalhes do
método e números em `docs/lakebed.md` · "Probe de atomicidade".

## Mudança

Guarda de idade mínima em `criarEstadoDb.gravar` **com adoção do canônico**:

| Linha atual | Resultado |
|---|---|
| não existe | grava (`"criada"`) |
| conteúdo igual | nada (`"igual"`) |
| difere, idade ≥ janela | grava (`"atualizada"`) |
| difere, idade < janela | não grava; **devolve a linha canônica** |

Sem a adoção, o DB seguiria servindo um cookie sabidamente morto por até a
janela — e como o hospedado não consulta memória entre requests
(`server/olhovivo.ts:81-84` só usa `sessaoMemoria` quando `lerSessao` é
indefinido; `server/index.ts:67` sempre define), todo request da janela releria
o morto, tomaria 401/403 e relogaria (~1,3–2,1 s + retry). Com adoção, quem
teve a escrita recusada recebe a sessão canônica recente — gravada há segundos
por um login que acabou de suceder, então vivo contra a vida absoluta de
~30 min — e a usa na própria tentativa.

**A adoção nunca readota cookie que o fluxo já rejeitou.** Na segunda tentativa
de `requisitar`, o canônico devolvido pode ser exatamente o cookie que acabou
de dar 401/403 (`cookiesRejeitados`). Adotá-lo seria trocar um cookie fresco e
vivo por um morto conhecido — 502 garantido justamente no caso em que o request
deveria suceder com o próprio login. Regra: valor cujo cookie está em
`cookiesRejeitados` não é adotado; fica o local.

## Contrato de `"ignorada"` (R5)

Três produtores, dois sem canônico: `db === null`, exceção engolida em
`gravarSessaoDb` e recusa por idade. O tipo carrega isso:
`Escrita = { resultado, vigente: string | null }` — `vigente` só é não-nulo na
recusa por idade (e espelha o valor em `criada`/`atualizada`/`igual`).
Consumidor trata `vigente === null` como "fica com o local"; o retorno nunca
mente sobre ausência de valor vigente.

## Decisões

**Envelope opaco, dentro de `estado-db`.** `gravar` continua recebendo a string
do chamador; internamente persiste `{ valor, gravadoEm }` e compara
`envelope.valor === valor` novo; `ler` desembrulha e devolve o valor cru.
Assim `estado-db` não aprende o formato da sessão nem `index.ts`/`olhovivo.ts`
aprendem o envelope. Consequência assumida: dedup opera sobre a string
serializada, determinística para sessões vindas do mesmo parser.

**Idade mínima: `idade >= JANELA_MS` autoriza sobrescrita.** Mesmo comparador
na prosa e nos testes (== janela grava; == janela−1 ignora).

**Janela de 120 s — troco declarado, com números medidos.**

- Teto mecânico (720/dia) **retirado**: pressupunha atomicidade, refutada pelo
  probe. A guarda é contenção parcial: rajada de 10 vira ~2 escritas; de 25,
  ~4 (com risco de 500 só acima disso). Com o poll sequencial limitando a
  geração por dispositivo (~10 usuários ⇒ rajadas ≤ 10 por morte de cookie),
  a projeção é ≤ ~100 escritas/dia contra cota de 1.000 — margem ≥ 10×.
- Custo no lado SPTrans: janela longa só amplia relogin quando a **adoção
  falha** (canônico jovem também morto) — aí cada request paga ~1,3–2,1 s por
  até 120 s. Troca assumida: risco de cota (derruba tudo) por latência pontual
  (degrada pouco e só em instabilidade).

**Sem preferência pela memória do isolate.** Comparar idades e preferir
`sessaoMemoria` mais nova que o DB depende de estado de módulo sobreviver entre
requests — que `docs/lakebed.md` declara não confiável no hospedado. O ganho
seria pular uma leitura indexada (~ms) contra logins de segundos; a adoção do
canônico resolve o mesmo mal no banco, única fonte que o hospedado garante.

**CAS é a única escalada para delta = 1.** O runtime v0.0.29 não expõe
compare-and-swap nem índice único; contenção parcial medida é o melhor sem ele.
Escalada condicionada a pressão real de cota observada em produção — hoje não
há.

## Etapas

0. **Gate de runtime — FEITO (24/08)** — probe executado; mundo (b) medido
   (~2 escapes em k=10, ~4 em k=25, 500 só acima disso); números e método em
   `docs/lakebed.md`. Decisão: guarda embarca como **contenção parcial**
   (desvio da letra da R3, justificado no topo).
1. **Envelope** — persistir `{ valor, gravadoEm }`; `ler` aceita envelope e
   legado (legado = elegível a sobrescrita imediata). Testes dos dois formatos.
2. **Guarda + adoção** — quarto estado com `agora()` injetável; `Escrita`
   carrega `vigente`; hook `gravarSessao` devolve a sessão a adotar (ou
   equivalente a "fica com a local"); `requisitar` adota só se o cookie não
   estiver em `cookiesRejeitados`. Testes: quarta linha da tabela; bordas
   (== janela grava; == janela−1 ignora); adoção do canônico vivo; **canônico
   rejeitado na segunda tentativa ⇒ usa o cookie próprio fresco e responde
   200**; `vigente: null` nos dois produtores sem canônico; legado migra na
   primeira escrita.
3. **Verificação local** — `npm test` e `npm run typecheck` verdes; suíte
   existente estendida, nada dela quebrado.
4. **Acompanhamento pós-deploy** (substitui o gate de delta ≤ 1, inviável no
   mundo (b)) — mutations/dia no painel sob uso real: saudável é ≤ ~100/dia
   com a população atual; tendência crescente reabre CAS.

## Critério de pronto (falsificável)

- Etapa 0 feita: mundo (b) com delta **e** distribuição medidos e registrados.
- Suíte local verde, incluindo borda da janela, adoção do canônico e o caso
  canônico-rejeitado-usa-o-local.
- Pós-deploy: mutations/dia dentro do pior caso medido; estouro ou tendência
  reprova e reabre CAS.

## Fora de escopo (explícito)

Contador de escritas no `/api/status`; CAS/índice único (escalada registrada,
condicionada a pressão real de cota); persistência de rotas GeoSampa;
mudanças no poll do cliente.
