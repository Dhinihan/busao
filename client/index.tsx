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

export { App };
