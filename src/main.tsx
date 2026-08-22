import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "leaflet/dist/leaflet.css";
import "./styles.css";

const raiz = document.getElementById("root");
if (raiz === null) throw new Error("elemento #root ausente no HTML");

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
