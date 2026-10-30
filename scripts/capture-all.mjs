import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9222;
const BASE_URL = "http://localhost:3000";

const prisma = new PrismaClient();

async function getSampleIds() {
  const org = await prisma.organization.findFirst({ where: { isDemo: true } });
  if (!org) throw new Error("Demo organization not found");
  const item = await prisma.item.findFirst({ where: { organizationId: org.id } });
  const tx = await prisma.inventoryTransaction.findFirst({ where: { organizationId: org.id } });
  const po = await prisma.purchaseOrder.findFirst({ where: { organizationId: org.id } });
  const mo = await prisma.productionOrder.findFirst({ where: { organizationId: org.id } });
  const opn = await prisma.stockCount.findFirst({ where: { organizationId: org.id } });

  return {
    itemId: item?.id,
    txId: tx?.id,
    poId: po?.id,
    moId: mo?.id,
    opnId: opn?.id,
  };
}

class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.cbs = new Map();
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.cbs.has(msg.id)) {
        const { resolve, reject } = this.cbs.get(msg.id);
        this.cbs.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const curId = this.id++;
      this.cbs.set(curId, { resolve, reject });
      this.ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || "Eval error");
    }
    return res.result?.value;
  }
}

async function captureRolePages(cdp, roleName, email, password, pages, outDir) {
  console.log(`\n============================================================`);
  console.log(`Mulai capture screenshot untuk role: ${roleName} (${email})`);
  console.log(`Output directory: ${outDir}`);
  console.log(`============================================================`);

  await fs.mkdir(outDir, { recursive: true });

  // 1. Clear cookies & navigate to login
  await cdp.send("Network.clearBrowserCookies");
  await cdp.send("Page.navigate", { url: `${BASE_URL}/login` });
  await new Promise((r) => setTimeout(r, 1000));

  // 2. Perform login via fetch in browser context
  const loginRes = await cdp.eval(`
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(password)} })
    }).then(r => r.json())
  `);

  if (!loginRes || !loginRes.ok) {
    throw new Error(`Login gagal untuk ${email}: ${JSON.stringify(loginRes)}`);
  }
  console.log(`✓ Login berhasil sebagai ${roleName}`);

  // Navigate to dashboard to ensure session context is established
  await cdp.send("Page.navigate", { url: `${BASE_URL}/dashboard` });
  await new Promise((r) => setTimeout(r, 1500));

  // 3. Loop through all pages
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const fullUrl = `${BASE_URL}${page.path}`;
    console.log(`[${i + 1}/${pages.length}] Mengambil screenshot: ${page.name} (${page.path})…`);

    await cdp.send("Page.navigate", { url: fullUrl });
    // Wait for hydration & data rendering
    await new Promise((r) => setTimeout(r, 1500));

    // Get true page height
    const dimensions = await cdp.eval(`
      (() => {
        const body = document.body;
        const html = document.documentElement;
        const scrollHeight = Math.max(
          body ? body.scrollHeight : 0,
          body ? body.offsetHeight : 0,
          html ? html.clientHeight : 0,
          html ? html.scrollHeight : 0,
          html ? html.offsetHeight : 0
        );
        return {
          width: 1920,
          height: scrollHeight
        };
      })()
    `);

    const width = 1920;
    // Minimal ratio 16/9: 1920 * 9 / 16 = 1080
    const minHeight = Math.round((width * 9) / 16);
    const targetHeight = Math.max(minHeight, dimensions?.height || minHeight);

    // Set viewport device metrics
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: targetHeight,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await new Promise((r) => setTimeout(r, 200));

    // Capture screenshot
    const shot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      fromSurface: true,
    });

    // Reset metrics
    await cdp.send("Emulation.clearDeviceMetricsOverride");

    const fileName = `${String(i + 1).padStart(2, "0")}_${page.slug}.png`;
    const filePath = path.join(outDir, fileName);
    await fs.writeFile(filePath, Buffer.from(shot.data, "base64"));
    console.log(`   -> Tersimpan: ${fileName} (${width}x${targetHeight}px)`);
  }
}

async function main() {
  const ids = await getSampleIds();
  await prisma.$disconnect();

  console.log("Sample IDs:", ids);

  // Daftar halaman lengkap untuk Owner
  const ownerPages = [
    { name: "Dashboard Utama", slug: "dashboard", path: "/dashboard" },
    { name: "Posisi Stok (Per Item)", slug: "stok-per-item", path: "/stok" },
    { name: "Posisi Stok (Per Lokasi)", slug: "stok-per-lokasi", path: "/stok?view=location" },
    ...(ids.itemId ? [{ name: "Detail Stok Item", slug: "stok-detail", path: `/stok/${ids.itemId}` }] : []),
    { name: "Master Item", slug: "master-item", path: "/items" },
    { name: "Gudang & Lokasi", slug: "warehouses-lokasi", path: "/warehouses" },
    { name: "Master Kategori", slug: "master-kategori", path: "/master/categories" },
    { name: "Master Satuan (UoM)", slug: "master-satuan", path: "/master/uom" },
    { name: "Master Supplier", slug: "master-supplier", path: "/master/suppliers" },
    { name: "Master Customer", slug: "master-customer", path: "/master/customers" },
    { name: "Transaksi Stok", slug: "transaksi-stok", path: "/transaksi" },
    ...(ids.txId ? [{ name: "Detail Transaksi Stok", slug: "transaksi-detail", path: `/transaksi/${ids.txId}` }] : []),
    { name: "Riwayat Pergerakan (Ledger)", slug: "riwayat-pergerakan", path: "/pergerakan" },
    { name: "Pembelian (Purchase Orders)", slug: "pembelian-po", path: "/pembelian" },
    ...(ids.poId ? [{ name: "Detail Purchase Order", slug: "pembelian-po-detail", path: `/pembelian/${ids.poId}` }] : []),
    { name: "Produksi - Work Orders", slug: "produksi-work-orders", path: "/produksi/orders" },
    ...(ids.moId ? [{ name: "Detail Work Order", slug: "produksi-work-order-detail", path: `/produksi/orders/${ids.moId}` }] : []),
    { name: "Produksi - Bill of Materials (BOM)", slug: "produksi-bom", path: "/produksi/bom" },
    { name: "Scrap & Material Sisa", slug: "scrap-material", path: "/scrap" },
    { name: "Stock Opname", slug: "stock-opname", path: "/opname" },
    ...(ids.opnId ? [{ name: "Detail Stock Opname", slug: "stock-opname-detail", path: `/opname/${ids.opnId}` }] : []),
    { name: "Laporan & Ekspor", slug: "laporan-analitik", path: "/laporan" },
    { name: "Import Data CSV", slug: "import-csv", path: "/import" },
    { name: "Audit Trail", slug: "audit-trail", path: "/audit" },
    { name: "Pengaturan Organisasi & Tim", slug: "pengaturan-organisasi", path: "/pengaturan" },
  ];

  // Daftar halaman untuk Staff Gudang
  const warehousePages = [
    { name: "Dashboard Utama", slug: "dashboard", path: "/dashboard" },
    { name: "Posisi Stok (Per Item)", slug: "stok-per-item", path: "/stok" },
    { name: "Posisi Stok (Per Lokasi)", slug: "stok-per-lokasi", path: "/stok?view=location" },
    ...(ids.itemId ? [{ name: "Detail Stok Item", slug: "stok-detail", path: `/stok/${ids.itemId}` }] : []),
    { name: "Master Item", slug: "master-item", path: "/items" },
    { name: "Gudang & Lokasi", slug: "warehouses-lokasi", path: "/warehouses" },
    { name: "Master Kategori", slug: "master-kategori", path: "/master/categories" },
    { name: "Master Satuan (UoM)", slug: "master-satuan", path: "/master/uom" },
    { name: "Master Supplier", slug: "master-supplier", path: "/master/suppliers" },
    { name: "Master Customer", slug: "master-customer", path: "/master/customers" },
    { name: "Transaksi Stok", slug: "transaksi-stok", path: "/transaksi" },
    ...(ids.txId ? [{ name: "Detail Transaksi Stok", slug: "transaksi-detail", path: `/transaksi/${ids.txId}` }] : []),
    { name: "Riwayat Pergerakan (Ledger)", slug: "riwayat-pergerakan", path: "/pergerakan" },
    { name: "Pembelian (Purchase Orders)", slug: "pembelian-po", path: "/pembelian" },
    ...(ids.poId ? [{ name: "Detail Purchase Order", slug: "pembelian-po-detail", path: `/pembelian/${ids.poId}` }] : []),
    { name: "Scrap & Material Sisa", slug: "scrap-material", path: "/scrap" },
    { name: "Stock Opname", slug: "stock-opname", path: "/opname" },
    ...(ids.opnId ? [{ name: "Detail Stock Opname", slug: "stock-opname-detail", path: `/opname/${ids.opnId}` }] : []),
    { name: "Laporan", slug: "laporan", path: "/laporan" },
  ];

  console.log(`Total Halaman Owner: ${ownerPages.length}`);
  console.log(`Total Halaman Staff Gudang: ${warehousePages.length}`);

  const userTemp = path.join(process.env.TEMP || "C:\\Temp", `edge-capture-${Date.now()}`);
  const proc = spawn(EDGE_PATH, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--window-size=1920,1080",
    "--disable-gpu",
    "--no-sandbox",
    `--user-data-dir=${userTemp}`,
  ]);

  try {
    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://localhost:${PORT}/json/version`);
        if (res.ok) {
          connected = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!connected) throw new Error("Could not connect to Edge via CDP");

    const listRes = await fetch(`http://localhost:${PORT}/json/list`);
    const list = await listRes.json();
    let target = list.find((t) => t.type === "page");
    if (!target) {
      const newRes = await fetch(`http://localhost:${PORT}/json/new?http://localhost:3000`, { method: "PUT" });
      target = await newRes.json();
    }

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    const cdp = new CdpSession(ws);

    await cdp.send("Page.enable");
    await cdp.send("Network.enable");

    // 1. Capture Owner
    await captureRolePages(
      cdp,
      "Owner",
      "demo@demo.com",
      "demo1234",
      ownerPages,
      path.join(process.cwd(), "screenshots", "owner")
    );

    // 2. Capture Staff Gudang
    await captureRolePages(
      cdp,
      "Staff Gudang",
      "gudang@demo.com",
      "demo1234",
      warehousePages,
      path.join(process.cwd(), "screenshots", "staff-gudang")
    );

    ws.close();
    console.log("\n============================================================");
    console.log("✓ SEMUA SCREENSHOT BERHASIL DIAMBIL SECARA LENGKAP!");
    console.log("============================================================");
  } finally {
    proc.kill();
    // clean temp
    try {
      await fs.rm(userTemp, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});

