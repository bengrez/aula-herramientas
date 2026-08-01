import { loadBundle } from "./engine/loader.mjs";
import { registerServiceWorker } from "./infra/sw-client.mjs";
import { drawQr } from "./infra/qr.mjs";
import { clear, element } from "./ui/dom.mjs";
import { assessReleaseReadiness } from "./engine/release-readiness.mjs";
import { buildDemoBundle } from "./engine/demo-isolation.mjs";

const root = document.querySelector('[data-ui="access-sheet"]');
const demoMode = new URLSearchParams(location.search).get("demo") === "1";

function renderBlocked(bundle) {
  clear(root).append(
    element("div", { className: "notice release-gate", dataset: { kind: "error" }, role: "alert" }, [
      element("span", { className: "notice-icon", text: "!", "aria-hidden": "true" }),
      element("p", {}, [
        element("strong", { text: "Hoja real bloqueada. " }),
        document.createTextNode(bundle.deployment.ui.aviso_placeholder),
      ]),
    ]),
    element("p", {}, element("a", { href: "?demo=1", text: "Revisar la hoja técnica de demostración" })),
  );
}

function renderSheet(bundle) {
  const configuredUrl = bundle.deployment.operacion.url_publica.trim();
  const publicUrl = configuredUrl ? new URL(configuredUrl) : new URL("./", location.href);
  if (demoMode) publicUrl.searchParams.set("demo", "1");
  const canvas = element("canvas", { className: "qr-canvas access-qr", role: "img" });
  drawQr(canvas, publicUrl.href, { label: "Código QR para abrir la sesión Atlas" });
  const heading = element("h2", { text: bundle.deployment.ui.titulo });
  const urlLink = element("a", { href: publicUrl.href, text: publicUrl.href });
  clear(root).append(
    ...(demoMode ? [element("p", { className: "draft-stamp", text: "DEMOSTRACIÓN — NO DISTRIBUIR" })] : []),
    element("p", { className: "eyebrow", text: bundle.deployment.ui.etiqueta_sesion }),
    heading,
    element("p", { className: "access-instruction", text: "Escanea el QR con la cámara del teléfono o escribe la dirección completa en el navegador." }),
    canvas,
    element("p", { className: "public-url" }, urlLink),
    element("p", { className: "access-note", text: "Luego ingresa el código personal de tu tarjeta. Este QR no contiene tu código ni respuestas." }),
    element("div", { className: "button-row access-actions" }, [
      element("button", { type: "button", className: "primary-button", text: "Imprimir hoja", onclick: () => window.print() }),
      element("a", { className: "secondary-button", href: publicUrl.href, text: "Comprobar dirección" }),
    ]),
  );
  heading.setAttribute("tabindex", "-1");
  heading.focus();
}

try {
  const [loadedBundle] = await Promise.all([loadBundle(), registerServiceWorker()]);
  const releaseReady = assessReleaseReadiness(loadedBundle).ready;
  const bundle = demoMode ? buildDemoBundle(loadedBundle) : loadedBundle;
  if (!releaseReady && !demoMode) renderBlocked(bundle);
  else renderSheet(bundle);
} catch (error) {
  clear(root).append(element("div", { className: "notice", dataset: { kind: "error" }, role: "alert" }, [
    element("span", { className: "notice-icon", text: "!", "aria-hidden": "true" }),
    element("p", { text: `No fue posible preparar la hoja de acceso. ${error.message}` }),
  ]));
}
