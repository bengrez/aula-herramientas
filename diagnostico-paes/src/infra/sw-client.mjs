const RELOAD_MARKER = "diagnostic-sw-controller-reload";

function blockingUpdateError(message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.blocking = true;
  return error;
}

function waitForControllerChange(previousController, timeoutMs = 12_000) {
  if (navigator.serviceWorker.controller !== previousController) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      navigator.serviceWorker.removeEventListener("controllerchange", changed);
      reject(blockingUpdateError("La actualización offline no alcanzó a activarse"));
    }, timeoutMs);
    function changed() {
      clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener("controllerchange", changed);
      resolve();
    }
    navigator.serviceWorker.addEventListener("controllerchange", changed);
  });
}

function reloadAfterControllerChange() {
  let previousReload;
  try {
    previousReload = Number(sessionStorage.getItem(RELOAD_MARKER) ?? 0);
  } catch (cause) {
    throw blockingUpdateError("No fue posible preparar la actualización offline", cause);
  }
  if (Date.now() - previousReload < 15_000) {
    throw blockingUpdateError("La actualización offline necesita una recarga manual");
  }
  try {
    sessionStorage.setItem(RELOAD_MARKER, String(Date.now()));
  } catch (cause) {
    throw blockingUpdateError("No fue posible registrar la actualización offline", cause);
  }
  location.reload();
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return { supported: false, ready: false };
  try {
    const scriptUrl = new URL("../../sw.js", import.meta.url);
    const scopeUrl = new URL("../../", import.meta.url);
    const previousController = navigator.serviceWorker.controller;
    const registration = await navigator.serviceWorker.register(scriptUrl, { scope: scopeUrl.pathname });
    if (previousController && navigator.onLine) {
      try { await registration.update(); }
      catch (error) { console.warn("No fue posible comprobar una actualización offline", error); }
    }
    const updatePending = Boolean(previousController && (
      navigator.serviceWorker.controller !== previousController
      || registration.installing
      || registration.waiting
    ));
    if (updatePending) {
      await waitForControllerChange(previousController);
      reloadAfterControllerChange();
      return { supported: true, ready: false, updating: true };
    }
    await navigator.serviceWorker.ready;
    return { supported: true, ready: true };
  } catch (error) {
    console.warn("No fue posible activar el modo sin conexión", error);
    if (error?.blocking) throw error;
    return { supported: true, ready: false, error };
  }
}
