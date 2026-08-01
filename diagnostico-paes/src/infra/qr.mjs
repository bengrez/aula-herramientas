import { qrcodegen } from "../../vendor/qrcodegen.mjs";

export function drawQr(canvas, text, { border = 4, scale = 3, label = "Código QR del respaldo manual de esta sesión" } = {}) {
  const qr = qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.LOW);
  const size = (qr.size + border * 2) * scale;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);
  context.fillStyle = "#000000";
  for (let y = 0; y < qr.size; y += 1) {
    for (let x = 0; x < qr.size; x += 1) {
      if (qr.getModule(x, y)) context.fillRect((x + border) * scale, (y + border) * scale, scale, scale);
    }
  }
  canvas.setAttribute("aria-label", label);
  return qr.size;
}
