import { SupabaseHttp } from "./supabase-http.mjs";

export function createSubmissionPayload(attempt, responses) {
  return {
    p_enrollment_code: attempt.enrollment_code,
    p_attempt_id: attempt.attempt_id,
    p_administration_id: attempt.administration_id,
    p_session_template_id: attempt.session_template_id,
    p_session_version: attempt.session_version,
    p_framework_id: attempt.framework_id,
    p_framework_version: attempt.framework_version,
    p_enrollment_status: attempt.enrollment_status ?? "provisional",
    p_started_at: attempt.started_at,
    p_completed_at: attempt.completed_at,
    p_responses_json: responses.map((response) => ({
      response_id: response.response_id,
      item_id: response.item_id,
      item_version: response.item_version,
      selected_option: response.selected_option,
      omitted: response.omitted,
      response_time_ms: response.response_time_ms,
      presentation_order: response.presentation_order,
      client_recorded_at: response.client_recorded_at,
      source: response.source,
    })),
  };
}

export async function ensureQueued(store, attempt, responses) {
  const payload = createSubmissionPayload(attempt, responses);
  await store.queueAttempt(attempt.attempt_id, payload);
  return payload;
}

export function assertSyncReceipt(receipt, attemptId) {
  if (!receipt || !["synced", "already_synced", "orphaned", "already_orphaned"].includes(receipt.status)) {
    throw new Error("El servidor no confirmó la entrega con un estado reconocido");
  }
  if (receipt.attempt_id !== attemptId) {
    throw new Error("El servidor confirmó un intento distinto del enviado");
  }
  return receipt;
}

function inScope(entry, { attemptId, administrationId }) {
  return (!attemptId || entry.attempt_id === attemptId)
    && (!administrationId || entry.payload?.p_administration_id === administrationId);
}

export async function syncOutbox(store, backendConfig, {
  onChange = () => {},
  fetcher,
  attemptId,
  administrationId,
} = {}) {
  const scope = { attemptId, administrationId };
  const pending = (await store.listPendingOutbox()).filter((entry) => inScope(entry, scope));
  const existingOrphans = (await store.listOrphanedOutbox?.() ?? []).filter((entry) => inScope(entry, scope));
  if (!pending.length && existingOrphans.length) {
    const result = { state: "orphaned", pending: 0, orphaned: existingOrphans.length };
    onChange(result);
    return result;
  }
  if (!backendConfig.enabled) {
    onChange({ state: "manual", pending: pending.length });
    return { state: "manual", pending: pending.length };
  }
  if (!navigator.onLine) {
    onChange({ state: "offline", pending: pending.length });
    return { state: "offline", pending: pending.length };
  }
  if (!pending.length) {
    onChange({ state: "synced", pending: 0 });
    return { state: "synced", pending: 0 };
  }

  const client = new SupabaseHttp(backendConfig, globalThis.localStorage, fetcher ?? globalThis.fetch.bind(globalThis));
  let failures = 0;
  for (const entry of pending) {
    onChange({ state: "syncing", pending: pending.length - (pending.indexOf(entry)) });
    try {
      const receipt = assertSyncReceipt(await client.rpc(backendConfig.rpc_name, entry.payload), entry.attempt_id);
      if (["orphaned", "already_orphaned"].includes(receipt.status)) {
        await store.markOrphaned(entry.attempt_id, receipt);
      } else {
        await store.markSynced(entry.attempt_id, receipt);
      }
    } catch (error) {
      failures += 1;
      await store.updateOutbox({ ...entry, status: "pending", attempts: entry.attempts + 1, last_error: String(error.message ?? error) });
    }
  }
  const remaining = (await store.listPendingOutbox()).filter((entry) => inScope(entry, scope)).length;
  const orphans = (await store.listOrphanedOutbox?.() ?? []).filter((entry) => inScope(entry, scope));
  const result = remaining
    ? { state: "pending", pending: remaining, failures }
    : orphans.length
      ? { state: "orphaned", pending: 0, orphaned: orphans.length, failures }
      : { state: "synced", pending: 0, failures };
  onChange(result);
  return result;
}
