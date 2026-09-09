// Base separada: nunca abre, migra ni purga diagnostic-engine-v1.
export class PracticeStore {
  constructor(name = "atlas-practice-v1") { this.name = name; }
  async open() {
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("profiles", { keyPath: "key" });
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("Cierra otras pestañas para actualizar el almacenamiento"));
    });
    this.db.onversionchange = () => this.db.close();
    return this;
  }
  async read(key) {
    return this.mutate(key, p => p, "readonly");
  }
  // Transformación sincrónica dentro de UNA transacción: dos pestañas no pierden ni duplican respuestas.
  async mutate(key, transform, mode = "readwrite") {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("profiles", mode); const store = tx.objectStore("profiles");
      let result, failure;
      const req = store.get(key);
      req.onsuccess = () => {
        try {
          result = transform(req.result ?? { key, sets: [], remote: [], acknowledged: [] });
          if (mode === "readwrite") store.put(result);
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(failure ?? tx.error ?? new Error("No se pudo guardar la práctica"));
    });
  }
  close() { this.db?.close(); }
}
