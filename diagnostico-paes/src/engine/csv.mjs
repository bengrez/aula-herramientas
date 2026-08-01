export const RAW_RESPONSE_COLUMNS = Object.freeze([
  "response_id",
  "attempt_id",
  "participant_ref",
  "administration_id",
  "session_template_id",
  "session_version",
  "framework_id",
  "framework_version",
  "item_id",
  "item_version",
  "selected_option",
  "omitted",
  "response_time_ms",
  "presentation_order",
  "client_recorded_at",
  "server_received_at",
  "source",
]);

const FORBIDDEN_DERIVED_COLUMNS = /(^|_)(correct|incorrect|score|percent|grade|diagnos|state|rank|puntaje|nota|acierto|error)($|_)/i;

export function assertRawColumns(columns = RAW_RESPONSE_COLUMNS) {
  const forbidden = columns.filter((column) => FORBIDDEN_DERIVED_COLUMNS.test(column));
  if (forbidden.length) throw new Error(`La exportación incluye columnas derivadas: ${forbidden.join(", ")}`);
  return true;
}

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function responsesToCsv(rows, columns = RAW_RESPONSE_COLUMNS) {
  assertRawColumns(columns);
  return [columns.join(","), ...rows.map((row) => columns.map((column) => escapeCsv(row[column])).join(","))].join("\r\n") + "\r\n";
}

export function backupToRawRows({ attempt, responses }, participantRef = "") {
  return responses.map((response) => ({
    ...response,
    participant_ref: participantRef,
    server_received_at: "",
  }));
}

export function downloadCsv(csv, filename) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
