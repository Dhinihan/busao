import { App } from "./App";

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E" +
  "%3Crect width='64' height='64' rx='14' fill='%23131211'/%3E" +
  "%3Crect x='14' y='9' width='36' height='40' rx='7' fill='%23ffb300'/%3E" +
  "%3Crect x='19' y='14' width='26' height='13' rx='3' fill='%23131211'/%3E" +
  "%3Ccircle cx='21.5' cy='42' r='2.5' fill='%23131211'/%3E" +
  "%3Ccircle cx='42.5' cy='42' r='2.5' fill='%23131211'/%3E" +
  "%3Crect x='16' y='49' width='9' height='7' rx='2.5' fill='%23ffb300'/%3E" +
  "%3Crect x='39' y='49' width='9' height='7' rx='2.5' fill='%23ffb300'/%3E" +
  "%3C/svg%3E";

const icone = document.createElement("link");
icone.rel = "icon";
icone.type = "image/svg+xml";
icone.href = FAVICON;
document.head.append(icone);

// Estilos que o Tailwind não cobre: keyframes autorais. Mesmo padrão do
// favicon acima — lakebed não aceita arquivo CSS (docs/lakebed.md).
const ESTILOS =
  // Respiração constante (equivalente ao animate-pulse) somada ao blip de
  // atualização numa única declaração: duas regras de `animation`
  // competiriam pela mesma propriedade.
  ".ponto-ciclo{" +
  "animation:pulso-ponto 2s cubic-bezier(0.4,0,0.6,1) infinite," +
  "blip-atualizacao 4s ease-out" +
  "}" +
  "@keyframes pulso-ponto{50%{opacity:.5}}" +
  // Chegou dado: segura o âmbar (até 1,8s) e solta anel duplo expandindo.
  "@keyframes blip-atualizacao{" +
  "0%{background-color:#ffb300;box-shadow:0 0 0 0 rgba(255,179,0,.85);transform:scale(1)}" +
  "22%{background-color:#ffb300;box-shadow:0 0 0 5px rgba(255,179,0,.6);transform:scale(1.4)}" +
  "45%{background-color:#ffb300;transform:scale(1)}" +
  "70%{box-shadow:0 0 0 10px rgba(255,179,0,.3)}" +
  "100%{background-color:#0a6b3c;box-shadow:0 0 0 16px rgba(255,179,0,0);transform:scale(1)}" +
  "}" +
  // Camada de ônibus no mapa: lift de brilho forte + scale coletivo curto
  // + borda dos discos flashando âmbar antes de voltar ao preto.
  ".camada-onibus{animation:pop-camada 1.2s ease-out}" +
  "@keyframes pop-camada{" +
  "0%,18%{filter:brightness(1.75) saturate(1.35)}" +
  "100%{filter:none}" +
  "}" +
  ".camada-onibus .marcador-onibus{animation:sobe-onibus .55s cubic-bezier(.2,.7,.3,1.15)}" +
  "@keyframes sobe-onibus{" +
  "0%,35%{transform:scale(1.14)}" +
  "100%{transform:scale(1)}" +
  "}" +
  ".camada-onibus .disco-onibus{animation:borda-flash 1.4s ease-out}" +
  "@keyframes borda-flash{" +
  "0%,45%{border-color:#ffb300}" +
  "100%{border-color:#171717}" +
  "}" +
  // Pill de eventos: entra descendo, fica, some sozinha.
  ".pill-ciclo{animation:pill-ciclo 3.2s ease-out forwards}" +
  "@keyframes pill-ciclo{" +
  "0%{opacity:0;transform:translateY(-10px)}" +
  "8%,78%{opacity:1;transform:none}" +
  "100%{opacity:0;transform:translateY(-5px)}" +
  "}" +
  "@media (prefers-reduced-motion: reduce){" +
  ".ponto-ciclo,.camada-onibus,.camada-onibus .marcador-onibus," +
  ".camada-onibus .disco-onibus,.pill-ciclo{animation:none}" +
  "}";

const estilo = document.createElement("style");
estilo.textContent = ESTILOS;
document.head.append(estilo);

export { App };
