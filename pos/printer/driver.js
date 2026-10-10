/* Unruly Taste POS · printer driver hook (added 8 Oct 2026). NO printer is installed yet.
 *
 * Switching to a real printer later = (1) add/finish a driver below, (2) pick it in POS Settings
 * ("Printer driver", saved on the shop PC as settings.printer.driver). Nothing else changes: receipts are
 * already generated and queued for every walk-in and online order (print queue in data/pos.json).
 *
 * PrinterDriver interface
 *   id          string   stored in settings.printer.driver
 *   label       string   shown in Settings
 *   stub        boolean  true = placeholder, cannot be selected yet
 *   interactive boolean  true = needs a person (opens a dialog), never used for auto-print
 *   available() -> Promise<boolean>   MUST NOT probe hardware until the driver is really implemented
 *   print(job)  -> Promise<{ ok, skipped?, reason?, error? }>
 *        job = { no, width: 58|80, text, lines (ESC/POS line list), bytes (Uint8Array ESC/POS), html }
 *
 * Auto-print: a device ticked as "print station" (Settings > Receipts & printer) prints queued jobs with the
 * selected driver and marks them printed/failed on the shop PC. With driver "none" nothing is printed and
 * jobs stay "queued: ready to print, no printer".
 */
(function () {
  'use strict';
  const drivers = {};
  const register = (d) => { drivers[d.id] = d; return d; };

  // default: preview only
  register({ id: 'none', label: 'No printer yet (preview, PDF, .txt only)', available: async () => true,
    print: async () => ({ ok: false, skipped: true, reason: 'ready to print, no printer' }) });

  // the browser print dialog (any printer the device already has, or "Save as PDF"); manual only
  register({ id: 'browser', label: 'Browser print dialog (manual)', interactive: true, available: async () => typeof window.print === 'function',
    print: async (job) => { if (window.UTReceiptUI) window.UTReceiptUI.browserPrint(job); return { ok: true }; } });

  // ---------- future drivers (stubs: NOT implemented, never touch hardware) ----------
  // ESC/POS over USB in Chrome/Edge (WebUSB). Implementation sketch for later:
  //   const dev = await navigator.usb.requestDevice({ filters: [{ vendorId: 0x0416 /* printer's id */ }] });
  //   await dev.open(); await dev.selectConfiguration(1); await dev.claimInterface(0);
  //   await dev.transferOut(<bulk OUT endpoint>, job.bytes);
  register({ id: 'escpos-webusb', label: 'USB thermal printer (WebUSB, ESC/POS): coming later', stub: true,
    available: async () => false, print: async () => ({ ok: false, error: 'not implemented yet' }) });
  // ESC/POS over Bluetooth LE (Web Bluetooth, Android Chrome). Sketch: requestDevice({ filters: [{ services: [<printer service UUID>] }] })
  //   -> gatt.connect() -> characteristic.writeValueWithoutResponse(job.bytes in 100-byte chunks)
  register({ id: 'escpos-bluetooth', label: 'Bluetooth thermal printer (ESC/POS): coming later', stub: true,
    available: async () => false, print: async () => ({ ok: false, error: 'not implemented yet' }) });
  // Network printer (port 9100) or any printer via a small print agent on PC01: the agent reads queued jobs
  // from data/pos.json (job.text or rebuilt ESC/POS bytes), prints, and marks them printed. Browsers cannot open
  // raw TCP sockets, so a network printer always goes through the agent.
  register({ id: 'pc01-agent', label: 'Print agent on the shop PC (network/USB printer): coming later', stub: true,
    available: async () => false, print: async () => ({ ok: false, error: 'not implemented yet' }) });

  window.UTPrinter = { register, get: (id) => drivers[id] || drivers.none, list: () => Object.values(drivers) };
})();
