const DATABASE_NAME = "diagnostic-engine-v1";
const DATABASE_VERSION = 2;

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve, { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("La transacción local fue cancelada")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error), { once: true });
  });
}

async function openDatabase(name = DATABASE_NAME) {
  const request = indexedDB.open(name, DATABASE_VERSION);
  request.addEventListener("upgradeneeded", () => {
    const database = request.result;
    if (!database.objectStoreNames.contains("profiles")) database.createObjectStore("profiles", { keyPath: "deployment_id" });
    if (!database.objectStoreNames.contains("attempts")) {
      const attempts = database.createObjectStore("attempts", { keyPath: "attempt_id" });
      attempts.createIndex("administration_id", "administration_id", { unique: true });
    }
    if (!database.objectStoreNames.contains("responses")) {
      const responses = database.createObjectStore("responses", { keyPath: "response_id" });
      responses.createIndex("attempt_id", "attempt_id", { unique: false });
    }
    if (!database.objectStoreNames.contains("outbox")) database.createObjectStore("outbox", { keyPath: "attempt_id" });
    if (!database.objectStoreNames.contains("snapshots")) database.createObjectStore("snapshots", { keyPath: "attempt_id" });
    if (!database.objectStoreNames.contains("completion_receipts")) database.createObjectStore("completion_receipts", { keyPath: "administration_id" });
  });
  request.addEventListener("success", () => {
    request.result.addEventListener("versionchange", () => request.result.close());
  });
  return requestAsPromise(request);
}

export class LocalStore {
  constructor(database) {
    this.database = database;
  }

  static async open(name) {
    return new LocalStore(await openDatabase(name));
  }

  async getProfile(deploymentId) {
    const transaction = this.database.transaction("profiles", "readonly");
    return requestAsPromise(transaction.objectStore("profiles").get(deploymentId));
  }

  async putProfile(profile) {
    const transaction = this.database.transaction("profiles", "readwrite");
    transaction.objectStore("profiles").put(profile);
    await transactionDone(transaction);
    return profile;
  }

  async deleteProfile(deploymentId) {
    const transaction = this.database.transaction("profiles", "readwrite");
    transaction.objectStore("profiles").delete(deploymentId);
    await transactionDone(transaction);
  }

  async getAttemptByAdministration(administrationId) {
    const transaction = this.database.transaction("attempts", "readonly");
    return requestAsPromise(transaction.objectStore("attempts").index("administration_id").get(administrationId));
  }

  async getCompletionReceipt(administrationId) {
    const transaction = this.database.transaction("completion_receipts", "readonly");
    return requestAsPromise(transaction.objectStore("completion_receipts").get(administrationId));
  }

  async createAttempt(attempt, snapshot) {
    const transaction = this.database.transaction(["attempts", "snapshots"], "readwrite");
    transaction.objectStore("attempts").add(attempt);
    transaction.objectStore("snapshots").add({ attempt_id: attempt.attempt_id, captured_at: new Date().toISOString(), bundle: snapshot });
    await transactionDone(transaction);
    return attempt;
  }

  async getSnapshot(attemptId) {
    const transaction = this.database.transaction("snapshots", "readonly");
    return requestAsPromise(transaction.objectStore("snapshots").get(attemptId));
  }

  async putAttempt(attempt) {
    const transaction = this.database.transaction("attempts", "readwrite");
    transaction.objectStore("attempts").put(attempt);
    await transactionDone(transaction);
    return attempt;
  }

  async discardInstructionAttempt({ attemptId, deploymentId }) {
    const transaction = this.database.transaction(["profiles", "attempts", "responses", "outbox", "snapshots"], "readwrite");
    const attempts = transaction.objectStore("attempts");
    const responses = transaction.objectStore("responses");
    const outbox = transaction.objectStore("outbox");
    const [storedAttempt, responseKeys, queued] = await Promise.all([
      requestAsPromise(attempts.get(attemptId)),
      requestAsPromise(responses.index("attempt_id").getAllKeys(attemptId)),
      requestAsPromise(outbox.get(attemptId)),
    ]);
    if (!storedAttempt || storedAttempt.status !== "instructions" || responseKeys.length || queued) {
      transaction.abort();
      throw new Error("Solo se puede retirar una sesión provisional que todavía no comenzó");
    }
    attempts.delete(attemptId);
    transaction.objectStore("snapshots").delete(attemptId);
    transaction.objectStore("profiles").delete(deploymentId);
    await transactionDone(transaction);
  }

  async recordResponseAndAdvance(response, attempt) {
    const transaction = this.database.transaction(["responses", "attempts"], "readwrite");
    transaction.objectStore("responses").add(response);
    transaction.objectStore("attempts").put(attempt);
    await transactionDone(transaction);
    return attempt;
  }

  async getResponses(attemptId) {
    const transaction = this.database.transaction("responses", "readonly");
    const rows = await requestAsPromise(transaction.objectStore("responses").index("attempt_id").getAll(attemptId));
    return rows.sort((left, right) => left.presentation_order - right.presentation_order);
  }

  async queueAttempt(attemptId, payload) {
    const transaction = this.database.transaction("outbox", "readwrite");
    const store = transaction.objectStore("outbox");
    const existing = await requestAsPromise(store.get(attemptId));
    store.put({
      attempt_id: attemptId,
      payload,
      status: ["synced", "orphaned"].includes(existing?.status) ? existing.status : "pending",
      attempts: existing?.attempts ?? 0,
      last_error: existing?.last_error ?? null,
      queued_at: existing?.queued_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await transactionDone(transaction);
  }

  async getOutboxEntry(attemptId) {
    const transaction = this.database.transaction("outbox", "readonly");
    return requestAsPromise(transaction.objectStore("outbox").get(attemptId));
  }

  async listPendingOutbox() {
    const transaction = this.database.transaction("outbox", "readonly");
    const rows = await requestAsPromise(transaction.objectStore("outbox").getAll());
    return rows.filter((row) => row.status === "pending");
  }

  async listOrphanedOutbox() {
    const transaction = this.database.transaction("outbox", "readonly");
    const rows = await requestAsPromise(transaction.objectStore("outbox").getAll());
    return rows.filter((row) => row.status === "orphaned");
  }

  async updateOutbox(entry) {
    const transaction = this.database.transaction("outbox", "readwrite");
    transaction.objectStore("outbox").put({ ...entry, updated_at: new Date().toISOString() });
    await transactionDone(transaction);
  }

  async markSynced(attemptId, receipt) {
    const transaction = this.database.transaction(["outbox", "attempts"], "readwrite");
    const outbox = transaction.objectStore("outbox");
    const attempts = transaction.objectStore("attempts");
    const [entry, attempt] = await Promise.all([
      requestAsPromise(outbox.get(attemptId)),
      requestAsPromise(attempts.get(attemptId)),
    ]);
    outbox.put({ ...entry, status: "synced", receipt, last_error: null, updated_at: new Date().toISOString() });
    attempts.put({ ...attempt, status: "synced", sync_status: "synced", synced_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    await transactionDone(transaction);
  }

  async markOrphaned(attemptId, receipt) {
    const transaction = this.database.transaction(["outbox", "attempts"], "readwrite");
    const outbox = transaction.objectStore("outbox");
    const attempts = transaction.objectStore("attempts");
    const [entry, attempt] = await Promise.all([
      requestAsPromise(outbox.get(attemptId)),
      requestAsPromise(attempts.get(attemptId)),
    ]);
    outbox.put({ ...entry, status: "orphaned", receipt, last_error: null, updated_at: new Date().toISOString() });
    attempts.put({ ...attempt, sync_status: "orphaned", updated_at: new Date().toISOString() });
    await transactionDone(transaction);
  }

  async purgeSyncedAttempt({ attemptId, administrationId, deploymentId, completedAt }) {
    const stores = ["profiles", "attempts", "responses", "outbox", "snapshots", "completion_receipts"];
    const transaction = this.database.transaction(stores, "readwrite");
    const attempts = transaction.objectStore("attempts");
    const outbox = transaction.objectStore("outbox");
    const responses = transaction.objectStore("responses");
    const [storedAttempt, queued, responseKeys] = await Promise.all([
      requestAsPromise(attempts.get(attemptId)),
      requestAsPromise(outbox.get(attemptId)),
      requestAsPromise(responses.index("attempt_id").getAllKeys(attemptId)),
    ]);
    if (!storedAttempt || storedAttempt.administration_id !== administrationId || storedAttempt.status !== "synced" || queued?.status !== "synced") {
      transaction.abort();
      throw new Error("La copia local solo puede borrarse después de confirmar el respaldo en la nube");
    }
    transaction.objectStore("completion_receipts").put({
      administration_id: administrationId,
      completed_at: completedAt,
      purged_at: new Date().toISOString(),
      status: "local_copy_purged",
    });
    for (const key of responseKeys) responses.delete(key);
    attempts.delete(attemptId);
    outbox.delete(attemptId);
    transaction.objectStore("snapshots").delete(attemptId);
    transaction.objectStore("profiles").delete(deploymentId);
    await transactionDone(transaction);
    return this.getCompletionReceipt(administrationId);
  }

  close() {
    this.database.close();
  }
}

export function snapshotFromBundle(bundle) {
  return {
    active: bundle.active,
    deployment: bundle.deployment,
    framework: bundle.framework,
    bank: bundle.bank,
    session: bundle.session,
  };
}
