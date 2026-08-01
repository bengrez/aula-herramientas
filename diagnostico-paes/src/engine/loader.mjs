import { assertActiveConfig, assertBundle } from "./contracts.mjs";

async function fetchJson(url, cache = "default") {
  const response = await fetch(url, { cache });
  if (!response.ok) throw new Error(`No se pudo cargar ${url.pathname} (${response.status})`);
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`El archivo ${url.pathname} no contiene JSON válido`, { cause: error });
  }
}

export async function loadBundle(activeUrl = new URL("../../data/active.json", import.meta.url)) {
  const active = assertActiveConfig(await fetchJson(activeUrl, "no-store"));
  const resolve = (path) => new URL(path, activeUrl);
  const [deployment, framework, bank, session] = await Promise.all([
    fetchJson(resolve(active.deployment_url)),
    fetchJson(resolve(active.framework_url)),
    fetchJson(resolve(active.bank_url)),
    fetchJson(resolve(active.session_url)),
  ]);
  return assertBundle({ active, deployment, framework, bank, session, activeUrl: activeUrl.href });
}

export function itemMap(bundle) {
  return new Map(bundle.bank.items.map((item) => [`${item.item_id}@${item.version}`, item]));
}

export function orderedItems(bundle) {
  const byKey = itemMap(bundle);
  return bundle.session.items.map((ref) => byKey.get(`${ref.item_id}@${ref.item_version}`));
}
