import { useState, useEffect, useCallback, useRef } from 'react';
import Fuse from 'fuse.js';
import { Chart, registerables } from 'chart.js';
import * as XLSX from 'xlsx';
import {
  openDB, dbGetAll, dbAdd, dbPut, dbDelete, dbClear,
  getConfig, setConfig, initDefaultConfig,
  Storage, verifyMasterKey, getLicense, saveLicense, isLicenseValid, clearLicense,
  encryptData, decryptData, fmt, fmtDate, fmtDateTime, genVentaNum,
  toUSD, toCUP, numVal, getWeekRange,
  type Producto, type Venta, type VentaItem, type Cliente, type Gasto, type Anulacion, type Tasa, type CierreSemanal, type CierreDiario, type Transferencia, type LoteCompra
} from './lib/db';

Chart.register(...registerables);

// ============ TOAST ============
type Toast = { id: number; msg: string; type: 'ok' | 'err' | 'warn' | 'info' };
let toastId = 0;
let toastListeners: ((t: Toast[]) => void)[] = [];
let toasts: Toast[] = [];
function showToast(msg: string, type: Toast['type'] = 'info') {
  const t = { id: ++toastId, msg, type };
  toasts = [...toasts, t];
  toastListeners.forEach(fn => fn(toasts));
  setTimeout(() => { toasts = toasts.filter(x => x.id !== t.id); toastListeners.forEach(fn => fn(toasts)); }, 4000);
}
function ToastContainer() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => { toastListeners.push(setItems); return () => { toastListeners = toastListeners.filter(f => f !== setItems); }; }, []);
  return <div className="toast-container">{items.map(t => <div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>)}</div>;
}

// ============ LICENSE ============
function LicenseScreen({ onActivate }: { onActivate: () => void }) {
  const [step, setStep] = useState<'key' | 'plan'>('key');
  const [key, setKey] = useState('');
  const [err, setErr] = useState('');
  const handleKey = () => { if (verifyMasterKey(key)) { setStep('plan'); setErr(''); } else setErr('Clave incorrecta'); };
  const handlePlan = (days: number, plan: string) => { saveLicense({ plan, days, start: Date.now(), expires: days === 0 ? 0 : Date.now() + days * 86400000, active: true }); onActivate(); };
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="card p-8 w-full max-w-md">
        <div className="text-center mb-6"><h1 className="text-2xl font-bold" style={{ color: 'var(--primary)' }}>🔧 Ferretería Suárez</h1><p className="text-sm mt-2" style={{ color: 'var(--text2)' }}>Sistema de Gestión</p></div>
        {step === 'key' ? (<div><label className="block text-sm font-medium mb-2">Clave de activación</label><input type="password" className="input mb-3" value={key} onChange={e => setKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleKey()} />{err && <p className="text-red-500 text-sm mb-2">{err}</p>}<button className="btn btn-primary w-full justify-center" onClick={handleKey}>Verificar</button></div>) : (<div><p className="text-sm mb-4" style={{ color: 'var(--text2)' }}>Seleccione un plan:</p><div className="grid grid-cols-2 gap-3">{[{ d: 30, n: 'Prueba' }, { d: 90, n: 'Trimestral' }, { d: 365, n: 'Anual' }, { d: 0, n: 'Perpetuo' }].map(p => (<button key={p.d} className="btn btn-ghost flex-col py-4" onClick={() => handlePlan(p.d, p.n)}><span className="font-bold">{p.n}</span><span className="text-xs" style={{ color: 'var(--text2)' }}>{p.d === 0 ? 'Sin expiración' : `${p.d} días`}</span></button>))}</div></div>)}
      </div>
    </div>
  );
}

function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (<div className="modal-backdrop" onClick={onClose}><div className={`modal ${wide ? 'w-[900px]' : 'w-[550px]'}`} onClick={e => e.stopPropagation()}><div className="flex justify-between items-center mb-4"><h2 className="text-lg font-bold">{title}</h2><button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button></div>{children}</div></div>);
}

function HelpBtn({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (<><button className="help-btn" onClick={() => setShow(true)} title="Ayuda">?</button><Modal open={show} onClose={() => setShow(false)} title="📖 Ayuda"><p className="text-sm whitespace-pre-line">{text}</p><div className="flex justify-end mt-4"><button className="btn btn-primary" onClick={() => setShow(false)}>Entendido</button></div></Modal></>);
}

// ============ MAIN APP ============
type Page = 'dashboard' | 'inventory' | 'purchases' | 'transfers' | 'pos' | 'sales' | 'cancellations' | 'clients' | 'metrics' | 'expenses' | 'backup' | 'settings' | 'weekly' | 'daily' | 'history';

export default function App() {
  const [ready, setReady] = useState(false);
  const [licensed, setLicensed] = useState(false);
  const [page, setPage] = useState<Page>('dashboard');
  const [cfg, setCfg] = useState<Record<string, any>>({});
  const [kiosco, setKiosco] = useState(false);

  useEffect(() => {
    Storage.init();
    (async () => { await openDB(); await initDefaultConfig(); const c = await getConfig(); setCfg(c); setReady(true); if (isLicenseValid()) setLicensed(true); })();
  }, []);

  useEffect(() => {
    let isDark = cfg.tema === 'dark' || (cfg.tema === 'auto' && (new Date().getHours() < 6 || new Date().getHours() >= 18));
    document.documentElement.className = isDark ? 'dark' : '';
    document.body.className = cfg.size === 'sm' ? 'size-compact' : cfg.size === 'lg' ? 'size-large' : 'size-normal';
  }, [cfg.tema, cfg.size]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if (e.key === 'F3') { e.preventDefault(); setPage('pos'); }
      if (e.key === 'F5') { e.preventDefault(); setPage('dashboard'); }
      if (e.key === 'F9') { e.preventDefault(); setKiosco(k => !k); }
      if (e.key === 'Escape' && kiosco) setKiosco(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [kiosco]);

  if (!ready) return <div className="min-h-screen flex items-center justify-center"><div className="text-xl">Cargando...</div></div>;
  if (!licensed) return <LicenseScreen onActivate={() => { setLicensed(true); showToast('Licencia activada', 'ok'); }} />;

  const navItems: { id: Page; icon: string; label: string }[] = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'inventory', icon: '📦', label: 'Inventario' },
    { id: 'purchases', icon: '📥', label: 'Compras' },
    { id: 'transfers', icon: '🔄', label: 'Transferencias' },
    { id: 'pos', icon: '🛒', label: 'POS' },
    { id: 'sales', icon: '🧾', label: 'Ventas' },
    { id: 'daily', icon: '📆', label: 'Cierre Diario' },
    { id: 'weekly', icon: '📅', label: 'Cierre Semanal' },
    { id: 'history', icon: '📚', label: 'Histórico Cierres' },
    { id: 'cancellations', icon: '🚫', label: 'Anulaciones' },
    { id: 'clients', icon: '💳', label: 'Clientes' },
    { id: 'metrics', icon: '📈', label: 'Métricas' },
    { id: 'expenses', icon: '💸', label: 'Gastos' },
    { id: 'backup', icon: '💾', label: 'Respaldo' },
    { id: 'settings', icon: '⚙️', label: 'Ajustes' },
  ];

  const refreshCfg = async () => { setCfg(await getConfig()); };

  return (
    <div className="flex min-h-screen">
      {!kiosco && (<aside className="sidebar"><div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}><h1 className="font-bold text-base" style={{ color: 'var(--primary)' }}>🔧 Ferretería S.</h1></div><nav className="flex-1 py-2 overflow-y-auto">{navItems.map(n => (<div key={n.id} className={`sidebar-item ${page === n.id ? 'active' : ''}`} onClick={() => setPage(n.id)}><span>{n.icon}</span><span>{n.label}</span></div>))}</nav><div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}><button className="btn btn-ghost btn-sm w-full justify-center" onClick={() => setKiosco(true)}>⛶ Kiosco</button></div></aside>)}
      <main className="flex-1 overflow-auto">
        {!kiosco && (<header className="flex items-center justify-between px-6 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg2)' }}><h2 className="font-semibold text-lg">{navItems.find(n => n.id === page)?.icon} {navItems.find(n => n.id === page)?.label}</h2><span className="text-xs" style={{ color: 'var(--text2)' }}>1 USD = {fmt(cfg.tasa || 350)} CUP</span></header>)}
        <div className="p-4 md:p-6">
          {page === 'dashboard' && <Dashboard cfg={cfg} setPage={setPage} />}
          {page === 'inventory' && <Inventory cfg={cfg} />}
          {page === 'purchases' && <Purchases cfg={cfg} />}
          {page === 'transfers' && <Transfers cfg={cfg} />}
          {page === 'pos' && <POS cfg={cfg} />}
          {page === 'sales' && <Sales cfg={cfg} />}
          {page === 'daily' && <DailyClose cfg={cfg} />}
          {page === 'weekly' && <WeeklyClose cfg={cfg} />}
          {page === 'history' && <CierreHistory cfg={cfg} />}
          {page === 'cancellations' && <Cancellations cfg={cfg} />}
          {page === 'clients' && <Clients cfg={cfg} />}
          {page === 'metrics' && <Metrics cfg={cfg} />}
          {page === 'expenses' && <Expenses cfg={cfg} />}
          {page === 'backup' && <Backup cfg={cfg} />}
          {page === 'settings' && <Settings cfg={cfg} refreshCfg={refreshCfg} />}
        </div>
      </main>
      <ToastContainer />
    </div>
  );
}

// ============ DASHBOARD ============
function Dashboard({ cfg, setPage }: { cfg: Record<string, any>; setPage: (p: Page) => void }) {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [anulaciones, setAnulaciones] = useState<Anulacion[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cierresDiarios, setCierresDiarios] = useState<CierreDiario[]>([]);
  const tasa = cfg.tasa || 350;

  const load = useCallback(async () => {
    setVentas(await dbGetAll<Venta>('ventas'));
    setProductos(await dbGetAll<Producto>('productos'));
    setAnulaciones(await dbGetAll<Anulacion>('anulaciones'));
    setClientes(await dbGetAll<Cliente>('clientes'));
    setCierresDiarios(await dbGetAll<CierreDiario>('cierresDiarios'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const ventasHoy = ventas.filter(v => v.fecha >= today.getTime() && v.estado === 'pagada');
  
  // Cierre diario de hoy
  const cierreHoy = cierresDiarios.find(c => c.fecha === today.getTime());
  
  const cajaCUP = cierreHoy?.cajaCUP || ventasHoy.reduce((s, v) => s + v.pagos.efCUP + v.pagos.tfCUP, 0);
  const cajaUSD = cierreHoy?.cajaUSD || ventasHoy.reduce((s, v) => s + v.pagos.efUSD + v.pagos.tfUSD, 0);
  const totalHoyCUP = cierreHoy?.totalVentasCUP || ventasHoy.reduce((s, v) => s + v.totalCUP, 0);
  const totalHoyUSD = cierreHoy?.totalVentasUSD || ventasHoy.reduce((s, v) => s + v.totalUSD, 0);
  const inversionHoyCUP = cierreHoy?.costoVentasCUP || 0;
  const inversionHoyUSD = cierreHoy?.costoVentasUSD || 0;
  const gananciaHoyCUP = cierreHoy?.gananciaBrutaCUP || ventasHoy.reduce((s, v) => s + v.items.reduce((si, it) => {
    const precioConDescuento = it.precioCUP * (1 - v.descuento / 100);
    return si + (precioConDescuento - it.pep) * it.cantidad;
  }, 0), 0);
  const gananciaHoyUSD = cierreHoy?.gananciaBrutaUSD || 0;
  
  // Desglose de pagos hoy
  const efectivoCUP = cierreHoy?.efectivoCUP || ventasHoy.reduce((s, v) => s + v.pagos.efCUP, 0);
  const efectivoUSD = cierreHoy?.efectivoUSD || ventasHoy.reduce((s, v) => s + v.pagos.efUSD, 0);
  const transferenciaCUP = cierreHoy?.transferenciaCUP || ventasHoy.reduce((s, v) => s + v.pagos.tfCUP, 0);
  const transferenciaUSD = cierreHoy?.transferenciaUSD || ventasHoy.reduce((s, v) => s + v.pagos.tfUSD, 0);
  const creditoCUP = cierreHoy?.creditoCUP || ventasHoy.reduce((s, v) => s + v.pagos.pagarCUP, 0);
  const creditoUSD = cierreHoy?.creditoUSD || ventasHoy.reduce((s, v) => s + v.pagos.pagarUSD, 0);
  
  // Inventario por ubicación
  const inversionTiendaCUP = productos.reduce((s, p) => s + ((p.stockTienda || 0) * p.pep), 0);
  const inversionAlmacenCUP = productos.reduce((s, p) => s + ((p.stockAlmacen || 0) * p.pep), 0);
  const inversionTotalCUP = inversionTiendaCUP + inversionAlmacenCUP;
  const inversionTotalUSD = toUSD(inversionTotalCUP, tasa);
  
  const stockBajo = productos.filter(p => (p.stockTienda || 0) > 0 && (p.stockTienda || 0) <= p.min);
  const agotados = productos.filter(p => (p.stockTienda || 0) <= 0);
  const anulPend = anulaciones.filter(a => a.estado === 'pendiente');
  const clientesSaldo = clientes.filter(c => c.saldoCUP > 0 || c.saldoUSD > 0);

  // Simplificado: sin gráficos complejos por ahora

  return (
    <div>
      {(cfg.mostrarCajaCUP !== false || cfg.mostrarCajaUSD !== false) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {cfg.mostrarCajaCUP !== false && (
            <div className="card p-4" style={{ borderLeft: '4px solid var(--ok)' }}>
              <h3 className="font-bold text-sm mb-2" style={{ color: 'var(--ok)' }}>💵 CAJA CUP HOY</h3>
              <p className="text-2xl font-bold">{fmt(cajaCUP)} CUP</p>
              <p className="equivalent">≈ {fmt(toUSD(cajaCUP, tasa))} USD</p>
            </div>
          )}
          {cfg.mostrarCajaUSD !== false && (
            <div className="card p-4" style={{ borderLeft: '4px solid var(--info)' }}>
              <h3 className="font-bold text-sm mb-2" style={{ color: 'var(--info)' }}>💵 CAJA USD HOY</h3>
              <p className="text-2xl font-bold">{fmt(cajaUSD)} USD</p>
              <p className="equivalent">≈ {fmt(toCUP(cajaUSD, tasa))} CUP</p>
            </div>
          )}
        </div>
      )}

      {/* Totales combinados CUP + USD */}
      {(() => {
        const ventasTotalCUP = totalHoyCUP + (totalHoyUSD * tasa);
        const ventasTotalUSD = toUSD(ventasTotalCUP, tasa);
        const reponerTotalCUP = inversionHoyCUP + (inversionHoyUSD * tasa);
        const reponerTotalUSD = toUSD(reponerTotalCUP, tasa);
        const gananciaTotalCUP = gananciaHoyCUP + (gananciaHoyUSD * tasa);
        const gananciaTotalUSD = toUSD(gananciaTotalCUP, tasa);
        
        return (
          <div className="grid-4 mb-6">
            <div className="kpi"><div className="kpi-label">📊 Ventas Hoy</div><div className="kpi-value">{ventasHoy.length}</div><p className="equivalent">{fmt(ventasTotalCUP)} CUP ≈ {fmt(ventasTotalUSD)} USD</p></div>
            {cfg.mostrarInversion !== false && (
              <div className="kpi" style={{ borderLeftColor: 'var(--err)' }}><div className="kpi-label">🔄 Para Reponer</div><div className="kpi-value">{fmt(reponerTotalCUP)} CUP</div><p className="equivalent">≈ {fmt(reponerTotalUSD)} USD</p></div>
            )}
            {cfg.mostrarGanancia !== false && (
              <div className="kpi" style={{ borderLeftColor: 'var(--warn)' }}><div className="kpi-label">💰 Ganancia</div><div className="kpi-value">{fmt(gananciaTotalCUP)} CUP</div><p className="equivalent">≈ {fmt(gananciaTotalUSD)} USD</p><p className="text-xs" style={{ color: 'var(--text2)' }}>(Ventas - Reponer)</p></div>
            )}
            <div className="kpi" style={{ borderLeftColor: 'var(--err)' }}><div className="kpi-label">Stock Bajo / Agotados</div><div className="kpi-value">{stockBajo.length + agotados.length}</div></div>
          </div>
        );
      })()}
      
      {/* Desglose de Inventario por Ubicación - ELIMINADO del Dashboard */}
      
      {/* Desglose de Pagos Hoy */}
      {cfg.mostrarDesglosePagos !== false && (
        <div className="card p-4 mb-6">
          <h3 className="font-semibold mb-3">💳 Desglose de Pagos Hoy</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 rounded" style={{ background: 'var(--bg3)' }}>
              <p className="text-xs font-semibold mb-2">💵 Efectivo</p>
              <p className="text-lg font-bold">{fmt(efectivoCUP)} CUP</p>
              <p className="text-sm">{fmt(efectivoUSD)} USD</p>
            </div>
            <div className="p-3 rounded" style={{ background: 'var(--bg3)' }}>
              <p className="text-xs font-semibold mb-2">💳 Transferencia</p>
              <p className="text-lg font-bold">{fmt(transferenciaCUP)} CUP</p>
              <p className="text-sm">{fmt(transferenciaUSD)} USD</p>
            </div>
            <div className="p-3 rounded" style={{ background: 'var(--bg3)' }}>
              <p className="text-xs font-semibold mb-2">📝 Crédito (CxC)</p>
              <p className="text-lg font-bold">{fmt(creditoCUP)} CUP</p>
              <p className="text-sm">{fmt(creditoUSD)} USD</p>
            </div>
          </div>
        </div>
      )}

      {/* Gráficos simplificados - se pueden agregar después */}

      {/* Cierre del Día */}
      {cfg.mostrarCierreDia !== false && (
        <div className="card p-4 mb-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold">📊 Cierre del Día</h3>
            <span className="text-xs" style={{ color: 'var(--text2)' }}>{fmtDate(today.getTime())}</span>
          </div>
          {(() => {
            const ventasTotalCUP = totalHoyCUP + (totalHoyUSD * tasa);
            const reponerTotalCUP = inversionHoyCUP + (inversionHoyUSD * tasa);
            const gananciaTotalCUP = gananciaHoyCUP + (gananciaHoyUSD * tasa);
            
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs" style={{ color: 'var(--text2)' }}>Total Ventas</p>
                  <p className="text-lg font-bold">{fmt(ventasTotalCUP)} CUP</p>
                  <p className="text-xs">≈ {fmt(toUSD(ventasTotalCUP, tasa))} USD</p>
                </div>
                {cfg.mostrarInversion !== false && (
                  <div>
                    <p className="text-xs" style={{ color: 'var(--text2)' }}>🔄 Para Reponer</p>
                    <p className="text-lg font-bold" style={{ color: 'var(--err)' }}>{fmt(reponerTotalCUP)} CUP</p>
                    <p className="text-xs">≈ {fmt(toUSD(reponerTotalCUP, tasa))} USD</p>
                  </div>
                )}
                {cfg.mostrarGanancia !== false && (
                  <div>
                    <p className="text-xs" style={{ color: 'var(--text2)' }}>💰 Ganancia</p>
                    <p className="text-lg font-bold" style={{ color: 'var(--ok)' }}>{fmt(gananciaTotalCUP)} CUP</p>
                    <p className="text-xs">≈ {fmt(toUSD(gananciaTotalCUP, tasa))} USD</p>
                  </div>
                )}
                <div>
                  <p className="text-xs" style={{ color: 'var(--text2)' }}>Ventas Realizadas</p>
                  <p className="text-lg font-bold">{ventasHoy.length}</p>
                </div>
              </div>
            );
          })()}
        </div>
      )}
      
      <div className="card p-4 mb-6">
        <h3 className="font-semibold mb-3">Alertas</h3>
        <div className="space-y-2">
          {agotados.length > 0 && <div className="p-2 rounded cursor-pointer" style={{ background: '#fee2e2' }} onClick={() => setPage('inventory')}><span className="text-sm text-red-700">🔴 {agotados.length} productos agotados en tienda</span></div>}
          {stockBajo.length > 0 && <div className="p-2 rounded cursor-pointer" style={{ background: '#fef3c7' }} onClick={() => setPage('inventory')}><span className="text-sm text-amber-700">🟡 {stockBajo.length} productos con stock bajo en tienda</span></div>}
          {anulPend.length > 0 && <div className="p-2 rounded cursor-pointer" style={{ background: '#fef3c7' }} onClick={() => setPage('cancellations')}><span className="text-sm text-amber-700">🚫 {anulPend.length} anulaciones pendientes</span></div>}
          {clientesSaldo.length > 0 && <div className="p-2 rounded cursor-pointer" style={{ background: '#cffafe' }} onClick={() => setPage('clients')}><span className="text-sm text-cyan-700">💳 {clientesSaldo.length} clientes con saldo pendiente</span></div>}
          {agotados.length === 0 && stockBajo.length === 0 && anulPend.length === 0 && clientesSaldo.length === 0 && <p className="text-sm" style={{ color: 'var(--text2)' }}>✅ Sin alertas</p>}
        </div>
      </div>

      {/* Métricas adicionales basadas en cierres */}
      {(() => {
        // Productos más vendidos (últimos 7 días)
        const hace7Dias = new Date();
        hace7Dias.setDate(hace7Dias.getDate() - 7);
        hace7Dias.setHours(0, 0, 0, 0);
        
        const ventas7Dias = ventas.filter(v => v.fecha >= hace7Dias.getTime() && v.estado === 'pagada');
        
        // Calcular productos más vendidos
        const productosVendidos: Record<number, { nombre: string; cantidad: number; ventas: number; ganancia: number }> = {};
        ventas7Dias.forEach(v => {
          v.items.forEach(item => {
            if (!productosVendidos[item.productoId]) {
              productosVendidos[item.productoId] = { nombre: item.nombre, cantidad: 0, ventas: 0, ganancia: 0 };
            }
            productosVendidos[item.productoId].cantidad += item.cantidad;
            productosVendidos[item.productoId].ventas += item.subtotalCUP;
            const gananciaItem = (item.precioCUP - item.pep) * item.cantidad * (1 - v.descuento / 100);
            productosVendidos[item.productoId].ganancia += gananciaItem;
          });
        });
        
        const topVentas = Object.entries(productosVendidos)
          .sort((a, b) => b[1].cantidad - a[1].cantidad)
          .slice(0, 5);
        
        const topGanancia = Object.entries(productosVendidos)
          .sort((a, b) => b[1].ganancia - a[1].ganancia)
          .slice(0, 5);
        
        // Comparación con ayer
        const ayer = new Date();
        ayer.setDate(ayer.getDate() - 1);
        ayer.setHours(0, 0, 0, 0);
        const cierreAyer = cierresDiarios.find(c => c.fecha === ayer.getTime());
        const ventasAyer = cierreAyer ? cierreAyer.totalVentasCUP + (cierreAyer.totalVentasUSD * tasa) : 0;
        const ventasHoyTotal = totalHoyCUP + (totalHoyUSD * tasa);
        const cambioPorcentaje = ventasAyer > 0 ? ((ventasHoyTotal - ventasAyer) / ventasAyer) * 100 : 0;
        
        return (
          <>
            {/* Tendencia */}
            {ventasAyer > 0 && (
              <div className="card p-4 mb-6">
                <h3 className="font-semibold mb-3">📈 Tendencia vs Ayer</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm" style={{ color: 'var(--text2)' }}>Ventas ayer</p>
                    <p className="text-lg font-bold">{fmt(ventasAyer)} CUP</p>
                  </div>
                  <div className="text-4xl">{cambioPorcentaje >= 0 ? '📈' : '📉'}</div>
                  <div className="text-right">
                    <p className="text-sm" style={{ color: 'var(--text2)' }}>Ventas hoy</p>
                    <p className="text-lg font-bold">{fmt(ventasHoyTotal)} CUP</p>
                  </div>
                  <div className={`text-2xl font-bold ${cambioPorcentaje >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {cambioPorcentaje >= 0 ? '+' : ''}{fmt(cambioPorcentaje, 1)}%
                  </div>
                </div>
              </div>
            )}
            
            {/* Top productos */}
            {topVentas.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="card p-4">
                  <h3 className="font-semibold mb-3">🏆 Top 5 Más Vendidos (7 días)</h3>
                  <div className="space-y-2">
                    {topVentas.map(([id, data], index) => (
                      <div key={id} className="flex items-center justify-between p-2 rounded" style={{ background: 'var(--bg3)' }}>
                        <div className="flex items-center gap-3">
                          <span className="text-2xl font-bold" style={{ color: index === 0 ? '#fbbf24' : index === 1 ? '#9ca3af' : index === 2 ? '#d97706' : 'var(--text2)' }}>
                            {index + 1}
                          </span>
                          <div>
                            <p className="font-medium text-sm">{data.nombre}</p>
                            <p className="text-xs" style={{ color: 'var(--text2)' }}>{data.cantidad} unidades</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-sm">{fmt(data.ventas)} CUP</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="card p-4">
                  <h3 className="font-semibold mb-3">💰 Top 5 Mayor Ganancia (7 días)</h3>
                  <div className="space-y-2">
                    {topGanancia.map(([id, data], index) => (
                      <div key={id} className="flex items-center justify-between p-2 rounded" style={{ background: 'var(--bg3)' }}>
                        <div className="flex items-center gap-3">
                          <span className="text-2xl font-bold" style={{ color: index === 0 ? '#fbbf24' : index === 1 ? '#9ca3af' : index === 2 ? '#d97706' : 'var(--text2)' }}>
                            {index + 1}
                          </span>
                          <div>
                            <p className="font-medium text-sm">{data.nombre}</p>
                            <p className="text-xs" style={{ color: 'var(--text2)' }}>{data.cantidad} unidades</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-sm" style={{ color: 'var(--ok)' }}>{fmt(data.ganancia)} CUP</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}

// ============ INVENTORY ============
function Inventory({ cfg }: { cfg: Record<string, any> }) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [lotes, setLotes] = useState<LoteCompra[]>([]);
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [modal, setModal] = useState(false);
  const [mermaModal, setMermaModal] = useState<Producto | null>(null);
  const [mermaQty, setMermaQty] = useState(0);
  const [mermaUbicacion, setMermaUbicacion] = useState<'tienda' | 'almacen'>('tienda');
  const [lotesModal, setLotesModal] = useState<Producto | null>(null);
  const [editItem, setEditItem] = useState<Producto | null>(null);
  const [form, setForm] = useState<Partial<Producto>>({});
  const tasa = cfg.tasa || 350;

  const load = useCallback(async () => { 
    let productos = await dbGetAll<Producto>('productos');
    const lotes = await dbGetAll<LoteCompra>('lotesCompra');
    
    // Migración automática: asegurar que todos los productos tengan stockTienda y stockAlmacen
    let necesitaActualizar = false;
    for (const p of productos) {
      if (p.stockTienda === undefined || p.stockAlmacen === undefined) {
        p.stockTienda = p.stockTienda !== undefined ? p.stockTienda : (p.stock || 0);
        p.stockAlmacen = p.stockAlmacen !== undefined ? p.stockAlmacen : 0;
        p.stock = (p.stockTienda || 0) + (p.stockAlmacen || 0);
        await dbPut('productos', p);
        necesitaActualizar = true;
      }
    }
    
    if (necesitaActualizar) {
      productos = await dbGetAll<Producto>('productos');
    }
    
    setProductos(productos);
    setLotes(lotes);
  }, []);
  useEffect(() => { load(); }, [load]);

  const fuse = new Fuse(productos, { keys: ['nombre', 'codigo', 'categoria'], threshold: 0.4 });
  let filtered = search ? fuse.search(search).map(r => r.item) : productos;
  if (filterCat) filtered = filtered.filter(p => p.categoria === filterCat);
  if (filterStatus === 'low') filtered = filtered.filter(p => (p.stockTienda || 0) > 0 && (p.stockTienda || 0) <= p.min);
  if (filterStatus === 'out') filtered = filtered.filter(p => (p.stockTienda || 0) <= 0);
  if (filterStatus === 'ok') filtered = filtered.filter(p => (p.stockTienda || 0) > p.min);

  const inversionCUP = filtered.reduce((s, p) => s + (p.stock * p.pep), 0);
  const inversionUSD = toUSD(inversionCUP, tasa);

  const openNew = () => { setEditItem(null); setForm({ nombre: '', categoria: cfg.categorias?.[0] || '', unidad: cfg.unidades?.[0] || 'Unidad', compraCUP: 0, compraUSD: 0, ventaCUP: 0, ventaUSD: 0, pep: 0, pepUSD: 0, stock: 0, stockTienda: 0, stockAlmacen: 0, min: 0, foto: '', precioFijoCUP: false, precioFijoUSD: false }); setModal(true); };
  const openEdit = (p: Producto) => { setEditItem(p); setForm({ ...p }); setModal(true); };

  const handleVentaCUP = (val: number) => setForm(f => ({ ...f, ventaCUP: val, ventaUSD: toUSD(val, tasa) }));
  const handleVentaUSD = (val: number) => setForm(f => ({ ...f, ventaUSD: val, ventaCUP: toCUP(val, tasa) }));
  const handleCompraCUP = (val: number) => setForm(f => ({ ...f, compraCUP: val, compraUSD: toUSD(val, tasa) }));
  const handleCompraUSD = (val: number) => setForm(f => ({ ...f, compraUSD: val, compraCUP: toCUP(val, tasa) }));

  const handleFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 500000) { showToast('Máximo 500KB', 'err'); return; }
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, foto: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!form.nombre?.trim()) { showToast('Nombre requerido', 'err'); return; }
    // Calcular stock total
    const stockTienda = form.stockTienda || 0;
    const stockAlmacen = form.stockAlmacen || 0;
    const stockTotal = stockTienda + stockAlmacen;
    
    // Validación de consistencia
    if (stockTienda < 0 || stockAlmacen < 0) {
      showToast('El stock no puede ser negativo', 'err');
      return;
    }
    
    if (editItem) {
      let newPep = editItem.pep;
      let newPepUSD = editItem.pepUSD;
      if (form.compraCUP !== undefined && form.compraCUP !== editItem.compraCUP && editItem.stock > 0) {
        newPep = form.compraCUP;
      }
      if (form.compraUSD !== undefined && form.compraUSD !== editItem.compraUSD && editItem.stock > 0) {
        newPepUSD = form.compraUSD;
      }
      await dbPut('productos', { ...editItem, ...form, stock: stockTotal, stockTienda, stockAlmacen, pep: newPep, pepUSD: newPepUSD });
      showToast('Actualizado', 'ok');
    } else {
      const nuevo = { ...form, stock: stockTotal, stockTienda, stockAlmacen, pep: form.compraCUP || 0, pepUSD: form.compraUSD || 0, creado: Date.now() } as Producto;
      await dbAdd('productos', nuevo);
      showToast('Creado', 'ok');
    }
    setModal(false); load();
  };

  const del = async (p: Producto) => {
    if (!confirm(`¿Eliminar "${p.nombre}"?`)) return;
    await dbDelete('productos', p.id!); showToast('Eliminado', 'ok'); load();
  };

  const registrarMerma = async () => {
    if (!mermaModal || mermaQty <= 0) { showToast('Cantidad inválida', 'err'); return; }
    
    let newStockTienda = mermaModal.stockTienda || 0;
    let newStockAlmacen = mermaModal.stockAlmacen || 0;
    
    if (mermaUbicacion === 'tienda') {
      if (mermaQty > newStockTienda) { showToast('No hay suficiente stock en tienda', 'err'); return; }
      newStockTienda -= mermaQty;
    } else {
      if (mermaQty > newStockAlmacen) { showToast('No hay suficiente stock en almacén', 'err'); return; }
      newStockAlmacen -= mermaQty;
    }
    
    const newStockTotal = newStockTienda + newStockAlmacen;
    await dbPut('productos', { ...mermaModal, stock: newStockTotal, stockTienda: newStockTienda, stockAlmacen: newStockAlmacen });
    
    // Calcular pérdida (costo del producto)
    const perdidaCUP = mermaQty * (mermaModal.pep || 0);
    const perdidaUSD = mermaQty * (mermaModal.pepUSD || 0);
    
    // Registrar como gasto (pérdida por merma)
    await dbAdd('gastos', {
      concepto: `Merma: ${mermaModal.nombre} (${mermaQty} ${mermaModal.unidad})`,
      categoria: 'Merma',
      fecha: Date.now(),
      nota: `Pérdida por producto defectuoso/deteriorado en ${mermaUbicacion === 'tienda' ? 'tienda' : 'almacén'}`,
      montoCUP: perdidaCUP,
      montoUSD: perdidaUSD,
      creado: Date.now()
    } as Gasto);
    
    showToast(`Merma registrada: ${mermaQty} ${mermaModal.unidad}. Pérdida: ${fmt(perdidaCUP)} CUP`, 'warn');
    setMermaModal(null); setMermaQty(0); load();
  };

  const statusBadge = (p: Producto) => {
    const stockDisponible = p.stockTienda || 0;
    if (stockDisponible <= 0) return <span className="badge badge-err">Agotado</span>;
    if (stockDisponible <= p.min) return <span className="badge badge-warn">Bajo</span>;
    return <span className="badge badge-ok">OK</span>;
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input className="input max-w-xs" placeholder="🔍 Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="input max-w-[150px]" value={filterCat} onChange={e => setFilterCat(e.target.value)}><option value="">Categorías</option>{(cfg.categorias || []).map((c: string) => <option key={c}>{c}</option>)}</select>
        <select className="input max-w-[150px]" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="">Todos</option><option value="ok">Disponibles</option><option value="low">Stock bajo</option><option value="out">Agotados</option></select>
        <div className="flex gap-1 ml-auto">
          <button className={`btn btn-sm ${view === 'grid' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('grid')}>▦</button>
          <button className={`btn btn-sm ${view === 'table' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('table')}>☰</button>
          <button className="btn btn-primary btn-sm" onClick={openNew}>+ Nuevo</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="kpi" style={{ borderLeftColor: 'var(--info)' }}>
          <div className="kpi-label">💰 Inversión Total (CUP)</div>
          <div className="kpi-value">{fmt(inversionCUP)} CUP</div>
        </div>
        <div className="kpi" style={{ borderLeftColor: 'var(--ok)' }}>
          <div className="kpi-label">💰 Inversión Total (USD)</div>
          <div className="kpi-value">{fmt(inversionUSD)} USD</div>
        </div>
      </div>

      {view === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map(p => (
            <div key={p.id} className="product-card">
              {p.foto ? <img src={p.foto} alt={p.nombre} /> : <div style={{ height: 100, background: 'var(--bg3)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📦</div>}
              <h4 className="font-semibold text-sm mt-2 truncate">{p.nombre}</h4>
              <p className="text-xs" style={{ color: 'var(--text2)' }}>{p.categoria}</p>
              <div className="flex justify-between items-center mt-2">
                <span className="text-sm font-bold" style={{ color: 'var(--primary)' }}>{fmt(p.ventaCUP)}</span>
                {statusBadge(p)}
              </div>
              <p className="text-xs mt-1">🏪 {p.stockTienda || 0} | 📦 {p.stockAlmacen || 0}</p>
              <p className="text-xs" style={{ color: 'var(--text2)' }}>Inv: {fmt(p.stock * p.pep)} CUP</p>
              <div className="flex gap-1 mt-2">
                <button className="btn btn-ghost btn-sm flex-1" onClick={() => openEdit(p)}>✏️</button>
                <button className="btn btn-warn btn-sm flex-1" onClick={() => { setMermaModal(p); setMermaQty(0); }}>⚠️</button>
                <button className="btn btn-ghost btn-sm flex-1" onClick={() => del(p)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card table-wrap"><table><thead><tr><th>Producto</th><th>Cat.</th><th>🏪 Tienda</th><th>📦 Almacén</th><th>Total</th><th>PEP CUP</th><th>Venta CUP</th><th>Inv CUP</th><th>Inv USD</th><th>Lotes</th><th>Estado</th><th></th></tr></thead><tbody>{filtered.map(p => {
          const lotesProducto = lotes.filter(l => l.productoId === p.id && l.cantidadRestante > 0);
          return (<tr key={p.id}><td className="font-medium">{p.nombre}</td><td>{p.categoria}</td><td className="font-bold" style={{ color: 'var(--ok)' }}>{p.stockTienda || 0}</td><td className="font-bold" style={{ color: 'var(--info)' }}>{p.stockAlmacen || 0}</td><td>{p.stock}</td><td>{fmt(p.pep)}</td><td>{fmt(p.ventaCUP)}</td><td>{fmt(p.stock * p.pep)}</td><td>{fmt(toUSD(p.stock * p.pep, tasa))}</td><td>{lotesProducto.length > 0 ? <button className="btn btn-info btn-sm" onClick={() => setLotesModal(p)}>{lotesProducto.length} lote{lotesProducto.length > 1 ? 's' : ''}</button> : <span className="text-xs" style={{ color: 'var(--text2)' }}>Sin lotes</span>}</td><td>{statusBadge(p)}</td><td><button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>✏️</button> <button className="btn btn-warn btn-sm" onClick={() => { setMermaModal(p); setMermaQty(0); }}>⚠️</button> <button className="btn btn-ghost btn-sm" onClick={() => del(p)}>🗑️</button></td></tr>);
        })}</tbody></table></div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editItem ? 'Editar Producto' : 'Nuevo Producto'} wide>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="text-xs font-medium">Nombre *</label><input className="input" value={form.nombre || ''} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} /></div>
          <div><label className="text-xs font-medium">Categoría</label><select className="input" value={form.categoria || ''} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>{(cfg.categorias || []).map((c: string) => <option key={c}>{c}</option>)}</select></div>
          <div><label className="text-xs font-medium">Unidad</label><select className="input" value={form.unidad || ''} onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))}>{(cfg.unidades || []).map((u: string) => <option key={u}>{u}</option>)}</select></div>
          <div><label className="text-xs font-medium">Stock en Tienda</label><input type="number" className="input" value={numVal(form.stockTienda)} onChange={e => setForm(f => ({ ...f, stockTienda: e.target.value === '' ? 0 : +e.target.value }))} /></div>
          <div><label className="text-xs font-medium">Stock en Almacén</label><input type="number" className="input" value={numVal(form.stockAlmacen)} onChange={e => setForm(f => ({ ...f, stockAlmacen: e.target.value === '' ? 0 : +e.target.value }))} /></div>
          <div><label className="text-xs font-medium">Stock Mín.</label><input type="number" className="input" value={numVal(form.min)} onChange={e => setForm(f => ({ ...f, min: e.target.value === '' ? 0 : +e.target.value }))} /></div>
          <div><label className="text-xs font-medium">Compra CUP</label><input type="number" className="input" value={numVal(form.compraCUP)} onChange={e => handleCompraCUP(e.target.value === '' ? 0 : +e.target.value)} /></div>
          <div><label className="text-xs font-medium">Compra USD</label><input type="number" className="input" value={numVal(form.compraUSD)} onChange={e => handleCompraUSD(e.target.value === '' ? 0 : +e.target.value)} /></div>
          <div><label className="text-xs font-medium">Venta CUP</label><input type="number" className="input" value={numVal(form.ventaCUP)} onChange={e => handleVentaCUP(e.target.value === '' ? 0 : +e.target.value)} /></div>
          <div><label className="text-xs font-medium">Venta USD</label><input type="number" className="input" value={numVal(form.ventaUSD)} onChange={e => handleVentaUSD(e.target.value === '' ? 0 : +e.target.value)} /></div>
          <div className="col-span-2 flex gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.precioFijoCUP || false} onChange={e => setForm(f => ({ ...f, precioFijoCUP: e.target.checked }))} /> Precio CUP fijo</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.precioFijoUSD || false} onChange={e => setForm(f => ({ ...f, precioFijoUSD: e.target.checked }))} /> Precio USD fijo</label>
          </div>
          <div className="col-span-2"><label className="text-xs font-medium">Foto</label><input type="file" accept="image/*" className="input" onChange={handleFoto} />{form.foto && <img src={form.foto} className="mt-2 w-20 h-20 object-cover rounded" />}</div>
        </div>
        <div className="flex gap-2 mt-4 justify-end"><button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={save}>Guardar</button></div>
      </Modal>

      <Modal open={!!mermaModal} onClose={() => setMermaModal(null)} title="⚠️ Registrar Merma">
        {mermaModal && (<div className="space-y-3">
          <p className="text-sm">Producto: <strong>{mermaModal.nombre}</strong></p>
          <p className="text-xs" style={{ color: 'var(--text2)' }}>🏪 Tienda: {mermaModal.stockTienda || 0} | 📦 Almacén: {mermaModal.stockAlmacen || 0}</p>
          <div><label className="text-xs font-medium">Ubicación</label>
            <select className="input" value={mermaUbicacion} onChange={e => setMermaUbicacion(e.target.value as 'tienda' | 'almacen')}>
              <option value="tienda">🏪 Tienda</option>
              <option value="almacen">📦 Almacén</option>
            </select>
          </div>
          <div><label className="text-xs font-medium">Cantidad</label><input type="number" className="input" value={numVal(mermaQty)} onChange={e => setMermaQty(e.target.value === '' ? 0 : +e.target.value)} /></div>
        </div>)}
        <div className="flex gap-2 mt-4 justify-end"><button className="btn btn-ghost" onClick={() => setMermaModal(null)}>Cancelar</button><button className="btn btn-warn" onClick={registrarMerma}>Registrar</button></div>
      </Modal>
      
      <Modal open={!!lotesModal} onClose={() => setLotesModal(null)} title="📦 Lotes de Compra" wide>
        {lotesModal && (() => {
          const lotesProducto = lotes.filter(l => l.productoId === lotesModal.id && l.cantidadRestante > 0).sort((a, b) => a.fecha - b.fecha);
          const totalInvertido = lotesProducto.reduce((s, l) => s + (l.cantidadRestante * l.precioCompraCUP), 0);
          return (
            <div className="space-y-3">
              <p className="text-sm font-semibold">{lotesModal.nombre}</p>
              <p className="text-xs" style={{ color: 'var(--text2)' }}>Total invertido en lotes activos: <strong>{fmt(totalInvertido)} CUP</strong></p>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Fecha</th><th>Proveedor</th><th>Cant. Original</th><th>Restante</th><th>Precio CUP</th><th>Precio USD</th><th>Destino</th><th>Inversión</th></tr></thead>
                  <tbody>
                    {lotesProducto.map(l => (
                      <tr key={l.id}>
                        <td className="text-xs">{fmtDate(l.fecha)}</td>
                        <td>{l.proveedor || '-'}</td>
                        <td>{l.cantidad}</td>
                        <td className="font-bold">{l.cantidadRestante}</td>
                        <td>{fmt(l.precioCompraCUP)}</td>
                        <td>{fmt(l.precioCompraUSD)}</td>
                        <td>{l.destino === 'tienda' ? '🏪 Tienda' : '📦 Almacén'}</td>
                        <td className="font-semibold">{fmt(l.cantidadRestante * l.precioCompraCUP)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {lotesProducto.length === 0 && <p className="text-center py-4" style={{ color: 'var(--text2)' }}>Sin lotes activos</p>}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

// ============ PURCHASES ============
function Purchases({ cfg }: { cfg: Record<string, any> }) {
  const [compras, setCompras] = useState<any[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ productoId: 0, cantidad: 0, precioUnitCUP: 0, precioUnitUSD: 0, nota: '', proveedor: '', destino: 'almacen' as 'tienda' | 'almacen' });
  const tasa = cfg.tasa || 350;

  const load = useCallback(async () => { setCompras(await dbGetAll('compras')); setProductos(await dbGetAll<Producto>('productos')); }, []);
  useEffect(() => { load(); }, [load]);

  const producto = productos.find(p => p.id === form.productoId);
  const handlePrecioCUP = (val: number) => setForm(f => ({ ...f, precioUnitCUP: val, precioUnitUSD: toUSD(val, tasa) }));
  const handlePrecioUSD = (val: number) => setForm(f => ({ ...f, precioUnitUSD: val, precioUnitCUP: toCUP(val, tasa) }));

  const save = async () => {
    if (!form.productoId || !producto) { showToast('Seleccione producto', 'err'); return; }
    if (form.cantidad <= 0) { showToast('Cantidad > 0', 'err'); return; }
    if (form.precioUnitCUP <= 0 && form.precioUnitUSD <= 0) { showToast('Precio > 0', 'err'); return; }
    
    // Calcular nuevo PEP ponderado
    let newPep = producto.pep;
    let newPepUSD = producto.pepUSD;
    
    if (producto.stock > 0) {
      // Si hay stock, calcular PEP ponderado
      newPep = (producto.stock * producto.pep + form.cantidad * form.precioUnitCUP) / (producto.stock + form.cantidad);
      newPepUSD = (producto.stock * producto.pepUSD + form.cantidad * form.precioUnitUSD) / (producto.stock + form.cantidad);
    } else {
      // Si no hay stock, usar el precio de compra como nuevo PEP
      newPep = form.precioUnitCUP;
      newPepUSD = form.precioUnitUSD;
    }
    
    // Crear lote de compra
    const loteId = await dbAdd('lotesCompra', {
      productoId: producto.id!,
      cantidad: form.cantidad,
      cantidadRestante: form.cantidad,
      precioCompraCUP: form.precioUnitCUP,
      precioCompraUSD: form.precioUnitUSD,
      fecha: Date.now(),
      proveedor: form.proveedor,
      nota: form.nota,
      destino: form.destino
    } as LoteCompra);
    
    await dbAdd('compras', { productoId: producto.id!, productoNombre: producto.nombre, productoCodigo: producto.codigo, cantidad: form.cantidad, unidad: producto.unidad, precioUnitCUP: form.precioUnitCUP, precioUnitUSD: form.precioUnitUSD, totalCUP: form.cantidad * form.precioUnitCUP, totalUSD: form.cantidad * form.precioUnitUSD, nota: form.nota, proveedor: form.proveedor, destino: form.destino, loteId, fecha: Date.now(), creado: Date.now() });
    
    // Actualizar stock según destino
    let newStockTienda = producto.stockTienda || 0;
    let newStockAlmacen = producto.stockAlmacen || 0;
    
    if (form.destino === 'tienda') {
      newStockTienda += form.cantidad;
    } else {
      newStockAlmacen += form.cantidad;
    }
    
    const newStockTotal = newStockTienda + newStockAlmacen;
    await dbPut('productos', { ...producto, stock: newStockTotal, stockTienda: newStockTienda, stockAlmacen: newStockAlmacen, pep: isNaN(newPep) ? form.precioUnitCUP : newPep, pepUSD: isNaN(newPepUSD) ? form.precioUnitUSD : newPepUSD });
    showToast(`Compra registrada en ${form.destino === 'tienda' ? 'tienda' : 'almacén'}. PEP: ${fmt(isNaN(newPep) ? form.precioUnitCUP : newPep)} CUP`, 'ok');
    setModal(false); setForm({ productoId: 0, cantidad: 0, precioUnitCUP: 0, precioUnitUSD: 0, nota: '', proveedor: '', destino: 'almacen' }); load();
  };

  return (
    <div>
      <div className="flex justify-end mb-4"><button className="btn btn-primary" onClick={() => setModal(true)}>+ Nueva Compra</button></div>
      <div className="card table-wrap"><table><thead><tr><th>Fecha</th><th>Producto</th><th>Proveedor</th><th>Cant.</th><th>P.Unit CUP</th><th>P.Unit USD</th><th>Total CUP</th></tr></thead><tbody>{[...compras].sort((a, b) => b.fecha - a.fecha).map((c: any) => (<tr key={c.id}><td className="text-xs">{fmtDate(c.fecha)}</td><td>{c.productoNombre}</td><td>{c.proveedor || '-'}</td><td>{c.cantidad}</td><td>{fmt(c.precioUnitCUP)}</td><td>{fmt(c.precioUnitUSD)}</td><td className="font-semibold">{fmt(c.totalCUP)}</td></tr>))}</tbody></table></div>
      
      <Modal open={modal} onClose={() => setModal(false)} title="Registrar Compra">
        <div className="space-y-3">
          <div><label className="text-xs font-medium">Producto</label><select className="input" value={form.productoId} onChange={e => setForm(f => ({ ...f, productoId: +e.target.value }))}><option value={0}>Seleccionar...</option>{productos.map(p => <option key={p.id} value={p.id}>{p.nombre} (Stock: {p.stock})</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium">Cantidad</label><input type="number" className="input" value={numVal(form.cantidad)} onChange={e => setForm(f => ({ ...f, cantidad: e.target.value === '' ? 0 : +e.target.value }))} /></div>
            <div><label className="text-xs font-medium">Proveedor</label><input className="input" value={form.proveedor} onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))} /></div>
            <div><label className="text-xs font-medium">Destino</label>
              <select className="input" value={form.destino} onChange={e => setForm(f => ({ ...f, destino: e.target.value as 'tienda' | 'almacen' }))}>
                <option value="almacen">📦 Almacén</option>
                <option value="tienda">🏪 Tienda</option>
              </select>
            </div>
            <div><label className="text-xs font-medium">Precio Unit. CUP</label><input type="number" className="input" value={numVal(form.precioUnitCUP)} onChange={e => handlePrecioCUP(e.target.value === '' ? 0 : +e.target.value)} /></div>
            <div><label className="text-xs font-medium">Precio Unit. USD</label><input type="number" className="input" value={numVal(form.precioUnitUSD)} onChange={e => handlePrecioUSD(e.target.value === '' ? 0 : +e.target.value)} /></div>
          </div>
          <div><label className="text-xs font-medium">Nota</label><input className="input" value={form.nota} onChange={e => setForm(f => ({ ...f, nota: e.target.value }))} /></div>
        </div>
        <div className="flex gap-2 mt-4 justify-end"><button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={save}>Registrar</button></div>
      </Modal>
    </div>
  );
}

// ============ TRANSFERS ============
function Transfers({ cfg }: { cfg: Record<string, any> }) {
  const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ productoId: 0, cantidad: 0, desde: 'almacen' as 'tienda' | 'almacen', hacia: 'tienda' as 'tienda' | 'almacen', nota: '' });

  const load = useCallback(async () => {
    setTransferencias(await dbGetAll<Transferencia>('transferencias'));
    setProductos(await dbGetAll<Producto>('productos'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const producto = productos.find(p => p.id === form.productoId);

  const save = async () => {
    if (!form.productoId || !producto) { showToast('Seleccione producto', 'err'); return; }
    if (form.cantidad <= 0) { showToast('Cantidad > 0', 'err'); return; }
    if (form.desde === form.hacia) { showToast('Ubicación origen y destino deben ser diferentes', 'err'); return; }
    
    let newStockTienda = producto.stockTienda || 0;
    let newStockAlmacen = producto.stockAlmacen || 0;
    
    if (form.desde === 'tienda') {
      if (form.cantidad > newStockTienda) { showToast('Stock insuficiente en tienda', 'err'); return; }
      newStockTienda -= form.cantidad;
    } else {
      if (form.cantidad > newStockAlmacen) { showToast('Stock insuficiente en almacén', 'err'); return; }
      newStockAlmacen -= form.cantidad;
    }
    
    if (form.hacia === 'tienda') {
      newStockTienda += form.cantidad;
    } else {
      newStockAlmacen += form.cantidad;
    }
    
    const newStockTotal = newStockTienda + newStockAlmacen;
    
    await dbAdd('transferencias', {
      productoId: producto.id!,
      productoNombre: producto.nombre,
      cantidad: form.cantidad,
      unidad: producto.unidad,
      desde: form.desde,
      hacia: form.hacia,
      nota: form.nota,
      fecha: Date.now(),
      creado: Date.now()
    } as Transferencia);
    
    await dbPut('productos', { ...producto, stock: newStockTotal, stockTienda: newStockTienda, stockAlmacen: newStockAlmacen });
    showToast(`Transferencia: ${form.cantidad} ${producto.unidad} de ${form.desde === 'tienda' ? 'tienda' : 'almacén'} a ${form.hacia === 'tienda' ? 'tienda' : 'almacén'}`, 'ok');
    setModal(false);
    setForm({ productoId: 0, cantidad: 0, desde: 'almacen', hacia: 'tienda', nota: '' });
    load();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm" style={{ color: 'var(--text2)' }}>{transferencias.length} transferencias</p>
        <button className="btn btn-primary" onClick={() => setModal(true)}>+ Nueva Transferencia</button>
      </div>
      
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Producto</th><th>Cantidad</th><th>Desde</th><th>Hacia</th><th>Nota</th></tr></thead>
          <tbody>
            {[...transferencias].sort((a, b) => b.fecha - a.fecha).map(t => (
              <tr key={t.id}>
                <td className="text-xs">{fmtDateTime(t.fecha)}</td>
                <td>{t.productoNombre}</td>
                <td className="font-bold">{t.cantidad} {t.unidad}</td>
                <td>{t.desde === 'tienda' ? '🏪 Tienda' : '📦 Almacén'}</td>
                <td>{t.hacia === 'tienda' ? '🏪 Tienda' : '📦 Almacén'}</td>
                <td className="text-xs">{t.nota || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {transferencias.length === 0 && <p className="text-center py-8" style={{ color: 'var(--text2)' }}>Sin transferencias registradas</p>}

      <Modal open={modal} onClose={() => setModal(false)} title="🔄 Transferir Stock">
        <div className="space-y-3">
          <div><label className="text-xs font-medium">Producto</label>
            <select className="input" value={form.productoId} onChange={e => setForm(f => ({ ...f, productoId: +e.target.value }))}>
              <option value={0}>Seleccionar...</option>
              {productos.map(p => <option key={p.id} value={p.id}>{p.nombre} (🏪{p.stockTienda || 0} | 📦{p.stockAlmacen || 0})</option>)}
            </select>
          </div>
          {producto && (
            <div className="p-3 rounded" style={{ background: 'var(--bg3)' }}>
              <p className="text-sm">Stock actual: 🏪 <strong>{producto.stockTienda || 0}</strong> | 📦 <strong>{producto.stockAlmacen || 0}</strong></p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium">Desde</label>
              <select className="input" value={form.desde} onChange={e => setForm(f => ({ ...f, desde: e.target.value as 'tienda' | 'almacen' }))}>
                <option value="tienda">🏪 Tienda</option>
                <option value="almacen">📦 Almacén</option>
              </select>
            </div>
            <div><label className="text-xs font-medium">Hacia</label>
              <select className="input" value={form.hacia} onChange={e => setForm(f => ({ ...f, hacia: e.target.value as 'tienda' | 'almacen' }))}>
                <option value="tienda">🏪 Tienda</option>
                <option value="almacen">📦 Almacén</option>
              </select>
            </div>
          </div>
          <div><label className="text-xs font-medium">Cantidad</label><input type="number" className="input" value={numVal(form.cantidad)} onChange={e => setForm(f => ({ ...f, cantidad: e.target.value === '' ? 0 : +e.target.value }))} /></div>
          <div><label className="text-xs font-medium">Nota</label><input className="input" value={form.nota} onChange={e => setForm(f => ({ ...f, nota: e.target.value }))} /></div>
        </div>
        <div className="flex gap-2 mt-4 justify-end"><button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={save}>Transferir</button></div>
      </Modal>
    </div>
  );
}

// ============ POS (REDESIGNED) ============
function POS({ cfg }: { cfg: Record<string, any> }) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<VentaItem[]>([]);
  const [descuento, setDescuento] = useState(0);
  const [cobrarModal, setCobrarModal] = useState(false);
  const [moneda, setMoneda] = useState<'CUP' | 'USD'>('CUP');
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'transferencia' | 'dividido' | 'pagarTarde'>('efectivo');
  const [pagos, setPagos] = useState({ efCUP: 0, tfCUP: 0, pagarCUP: 0, efUSD: 0, tfUSD: 0, pagarUSD: 0 });
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [ticketVenta, setTicketVenta] = useState<Venta | null>(null);
  const tasa = cfg.tasa || 350;

  const load = useCallback(async () => { setProductos(await dbGetAll<Producto>('productos')); setClientes(await dbGetAll<Cliente>('clientes')); }, []);
  useEffect(() => { load(); }, [load]);

  const fuse = new Fuse(productos.filter(p => p.ventaCUP > 0 || p.ventaUSD > 0), { keys: ['nombre', 'codigo', 'categoria'], threshold: 0.4 });
  const results = search ? fuse.search(search).slice(0, 100).map(r => r.item) : productos.filter(p => p.ventaCUP > 0 || p.ventaUSD > 0).slice(0, 100);

  const addToCart = (p: Producto) => {
    const stockDisponible = p.stockTienda || 0;
    const ex = cart.find(c => c.productoId === p.id);
    if (ex) {
      if (ex.cantidad + 1 > stockDisponible) { showToast('Stock insuficiente en tienda', 'err'); return; }
      setCart(cart.map(c => c.productoId === p.id ? { ...c, cantidad: c.cantidad + 1, subtotalCUP: (c.cantidad + 1) * c.precioCUP, subtotalUSD: (c.cantidad + 1) * c.precioUSD } : c));
    } else {
      if (stockDisponible <= 0) { showToast('Sin stock en tienda', 'err'); return; }
      setCart([...cart, { productoId: p.id!, nombre: p.nombre, codigo: p.codigo, cantidad: 1, unidad: p.unidad, precioCUP: p.ventaCUP, precioUSD: p.ventaUSD, subtotalCUP: p.ventaCUP, subtotalUSD: p.ventaUSD, pep: p.pep, pepUSD: p.pepUSD }]);
    }
  };

  const updateQty = (pid: number, qty: number) => {
    const p = productos.find(pr => pr.id === pid);
    const stockDisponible = p ? (p.stockTienda || 0) : 0;
    if (p && qty > stockDisponible) { showToast('Stock insuficiente en tienda', 'err'); return; }
    if (qty <= 0) { setCart(cart.filter(c => c.productoId !== pid)); return; }
    setCart(cart.map(c => c.productoId === pid ? { ...c, cantidad: qty, subtotalCUP: qty * c.precioCUP, subtotalUSD: qty * c.precioUSD } : c));
  };

  // Calcular subtotales según la moneda seleccionada
  const subTotalCUP = moneda === 'CUP' ? cart.reduce((s, c) => s + c.subtotalCUP, 0) : 0;
  const subTotalUSD = moneda === 'USD' ? cart.reduce((s, c) => s + c.subtotalUSD, 0) : 0;
  const totalCUP = subTotalCUP * (1 - descuento / 100);
  const totalUSD = subTotalUSD * (1 - descuento / 100);
  const totalMoneda = moneda === 'CUP' ? totalCUP : totalUSD;

  // Calcular pagos automáticos según método
  useEffect(() => {
    if (!cobrarModal) return;
    // Solo resetear pagos si NO es "dividido" (para no perder la configuración manual del usuario)
    if (metodoPago === 'dividido') return;
    
    const newPagos = { efCUP: 0, tfCUP: 0, pagarCUP: 0, efUSD: 0, tfUSD: 0, pagarUSD: 0 };
    if (moneda === 'CUP') {
      if (metodoPago === 'efectivo') newPagos.efCUP = totalCUP;
      else if (metodoPago === 'transferencia') newPagos.tfCUP = totalCUP;
      else if (metodoPago === 'pagarTarde') newPagos.pagarCUP = totalCUP;
    } else {
      if (metodoPago === 'efectivo') newPagos.efUSD = totalUSD;
      else if (metodoPago === 'transferencia') newPagos.tfUSD = totalUSD;
      else if (metodoPago === 'pagarTarde') newPagos.pagarUSD = totalUSD;
    }
    setPagos(newPagos);
  }, [metodoPago, moneda, cobrarModal, totalCUP, totalUSD]);

  const confirmarVenta = async () => {
    if (cart.length === 0) { showToast('Carrito vacío', 'err'); return; }
    
    // Validar que los pagos sumen el total
    const sumaPagosCUP = pagos.efCUP + pagos.tfCUP + pagos.pagarCUP;
    const sumaPagosUSD = pagos.efUSD + pagos.tfUSD + pagos.pagarUSD;
    
    if (moneda === 'CUP' && totalCUP > 0 && Math.abs(sumaPagosCUP - totalCUP) > 0.01) {
      showToast(`Los pagos en CUP (${fmt(sumaPagosCUP)}) no suman el total (${fmt(totalCUP)})`, 'err');
      return;
    }
    if (moneda === 'USD' && totalUSD > 0 && Math.abs(sumaPagosUSD - totalUSD) > 0.01) {
      showToast(`Los pagos en USD (${fmt(sumaPagosUSD)}) no suman el total (${fmt(totalUSD)})`, 'err');
      return;
    }
    
    const tienePagarTarde = pagos.pagarCUP > 0 || pagos.pagarUSD > 0;
    if (tienePagarTarde && !clienteId) { showToast('Seleccione cliente para "Pagar más tarde"', 'err'); return; }
    for (const item of cart) { const pr = productos.find(x => x.id === item.productoId); if (!pr || (pr.stockTienda || 0) < item.cantidad) { showToast(`Stock insuficiente en tienda: ${item.nombre}`, 'err'); return; } }

    // Calcular costo real usando FIFO (solo en la moneda seleccionada)
    const lotes = await dbGetAll<LoteCompra>('lotesCompra');
    let costoTotalCUP = moneda === 'CUP' ? 0 : 0;
    let costoTotalUSD = moneda === 'USD' ? 0 : 0;
    
    const venta: Venta = {
      num: genVentaNum(), fecha: Date.now(), items: cart, descuento,
      totalCUP, totalUSD, pagos, clienteId,
      clienteNombre: clientes.find(c => c.id === clienteId)?.nombre || '',
      estado: 'pagada',
      pagarMasTardeCUP: pagos.pagarCUP, pagarMasTardeUSD: pagos.pagarUSD
    };
    await dbAdd('ventas', venta);
    
    // Descontar de stockTienda y actualizar lotes usando FIFO
    for (const item of cart) { 
      const pr = productos.find(x => x.id === item.productoId)!; 
      const newStockTienda = (pr.stockTienda || 0) - item.cantidad;
      const newStockAlmacen = pr.stockAlmacen || 0;
      
      // Buscar lotes de este producto ordenados por fecha (FIFO)
      const lotesProducto = lotes
        .filter(l => l.productoId === item.productoId && l.cantidadRestante > 0)
        .sort((a, b) => a.fecha - b.fecha);
      
      let cantidadRestante = item.cantidad;
      
      // Si no hay lotes, usar el PEP del producto como costo
      if (lotesProducto.length === 0) {
        if (moneda === 'CUP') {
          costoTotalCUP += item.cantidad * (pr.pep || 0);
        } else {
          const precioUSD = pr.pepUSD > 0 ? pr.pepUSD : toUSD(pr.pep || 0, tasa);
          costoTotalUSD += item.cantidad * precioUSD;
        }
      } else {
        // Si hay lotes, usar FIFO
        for (const lote of lotesProducto) {
          if (cantidadRestante <= 0) break;
          
          const usarDelLote = Math.min(cantidadRestante, lote.cantidadRestante);
          
          // Solo calcular costo en la moneda seleccionada
          if (moneda === 'CUP') {
            costoTotalCUP += usarDelLote * lote.precioCompraCUP;
          } else {
            // Si el lote no tiene precioCompraUSD, calcularlo desde precioCompraCUP
            const precioUSD = lote.precioCompraUSD > 0 ? lote.precioCompraUSD : toUSD(lote.precioCompraCUP, tasa);
            costoTotalUSD += usarDelLote * precioUSD;
          }
          
          lote.cantidadRestante -= usarDelLote;
          cantidadRestante -= usarDelLote;
          
          await dbPut('lotesCompra', lote);
        }
      }
      
      await dbPut('productos', { ...pr, stock: newStockTienda + newStockAlmacen, stockTienda: newStockTienda, stockAlmacen: newStockAlmacen }); 
    }
    
    // Calcular ganancia real
    const gananciaCUP = totalCUP - costoTotalCUP;
    const gananciaUSD = totalUSD - costoTotalUSD;
    if (tienePagarTarde && clienteId) {
      const cl = clientes.find(c => c.id === clienteId)!;
      await dbPut('clientes', { ...cl, saldoCUP: Math.max(0, cl.saldoCUP + pagos.pagarCUP), saldoUSD: Math.max(0, cl.saldoUSD + pagos.pagarUSD), compras: cl.compras + 1, ultimaCompra: Date.now() });
    } else if (clienteId) {
      const cl = clientes.find(c => c.id === clienteId)!;
      await dbPut('clientes', { ...cl, compras: cl.compras + 1, ultimaCompra: Date.now() });
    }

    setTicketVenta(venta); 
    showToast(`Venta ${venta.num} | Ganancia: ${fmt(gananciaCUP)} CUP / ${fmt(gananciaUSD)} USD`, 'ok');
    
    // Crear o actualizar cierre diario
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fechaHoy = hoy.getTime();
    
    const cierresDiarios = await dbGetAll<CierreDiario>('cierresDiarios');
    let cierreHoy = cierresDiarios.find(c => c.fecha === fechaHoy);
    
    if (cierreHoy) {
      // Actualizar cierre existente
      cierreHoy.ventasIds.push(venta.id!);
      cierreHoy.totalVentasCUP += totalCUP;
      cierreHoy.totalVentasUSD += totalUSD;
      cierreHoy.costoVentasCUP += costoTotalCUP;
      cierreHoy.costoVentasUSD += costoTotalUSD;
      cierreHoy.gananciaBrutaCUP += gananciaCUP;
      cierreHoy.gananciaBrutaUSD += gananciaUSD;
      cierreHoy.cajaCUP += pagos.efCUP + pagos.tfCUP;
      cierreHoy.cajaUSD += pagos.efUSD + pagos.tfUSD;
      cierreHoy.efectivoCUP += pagos.efCUP;
      cierreHoy.efectivoUSD += pagos.efUSD;
      cierreHoy.transferenciaCUP += pagos.tfCUP;
      cierreHoy.transferenciaUSD += pagos.tfUSD;
      cierreHoy.creditoCUP += pagos.pagarCUP;
      cierreHoy.creditoUSD += pagos.pagarUSD;
      await dbPut('cierresDiarios', cierreHoy);
    } else {
      // Crear nuevo cierre diario
      const nuevoCierre: CierreDiario = {
        fecha: fechaHoy,
        ventasIds: [venta.id!],
        totalVentasCUP: totalCUP,
        totalVentasUSD: totalUSD,
        costoVentasCUP: costoTotalCUP,
        costoVentasUSD: costoTotalUSD,
        gananciaBrutaCUP: gananciaCUP,
        gananciaBrutaUSD: gananciaUSD,
        cajaCUP: pagos.efCUP + pagos.tfCUP,
        cajaUSD: pagos.efUSD + pagos.tfUSD,
        efectivoCUP: pagos.efCUP,
        efectivoUSD: pagos.efUSD,
        transferenciaCUP: pagos.tfCUP,
        transferenciaUSD: pagos.tfUSD,
        creditoCUP: pagos.pagarCUP,
        creditoUSD: pagos.pagarUSD,
        tasaUsada: tasa,
        creado: Date.now()
      };
      await dbAdd('cierresDiarios', nuevoCierre);
    }
    
    setCart([]); setDescuento(0); setPagos({ efCUP: 0, tfCUP: 0, pagarCUP: 0, efUSD: 0, tfUSD: 0, pagarUSD: 0 }); setClienteId(null); setCobrarModal(false); load();
  };

  return (
    <div className="pos-grid">
      <div className="flex flex-col gap-3 overflow-hidden">
        <input className="input" placeholder="🔍 Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        {/* LISTA EN FILAS HORIZONTALES */}
        <div className="overflow-auto flex-1">
          <div className="card">
            <table>
              <thead><tr><th>Producto</th><th>Código</th><th>Precio</th><th>Stock</th><th></th></tr></thead>
              <tbody>
                {results.map(p => (
                  <tr key={p.id} className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20" onClick={() => addToCart(p)}>
                    <td className="font-medium">{p.nombre}</td>
                    <td className="font-mono text-xs">{p.codigo}</td>
                    <td><span style={{ color: 'var(--primary)' }} className="font-bold">{fmt(p.ventaCUP)}</span> <span className="text-xs" style={{ color: 'var(--text2)' }}>/ {fmt(p.ventaUSD)} USD</span></td>
                    <td><span className={(p.stockTienda || 0) <= p.min ? 'text-red-500 font-bold' : ''}>{p.stockTienda || 0}</span></td>
                    <td><button className="btn btn-primary btn-sm">+ Agregar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="card p-4 flex flex-col overflow-hidden">
        <h3 className="font-bold mb-2">🛒 Carrito ({cart.length})</h3>
        <div className="flex-1 overflow-auto space-y-2 mb-3">
          {cart.map(c => (
            <div key={c.productoId} className="p-2 rounded flex items-center gap-2" style={{ background: 'var(--bg3)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.nombre}</p>
                <p className="text-xs" style={{ color: 'var(--text2)' }}>{fmt(c.precioCUP)} × {c.cantidad} = {fmt(c.subtotalCUP)}</p>
              </div>
              <div className="flex items-center gap-1">
                <button className="btn btn-ghost btn-sm" onClick={() => updateQty(c.productoId, c.cantidad - 1)}>-</button>
                <input type="number" className="input w-12 text-center text-xs" value={numVal(c.cantidad)} onChange={e => updateQty(c.productoId, e.target.value === '' ? 0 : +e.target.value)} />
                <button className="btn btn-ghost btn-sm" onClick={() => updateQty(c.productoId, c.cantidad + 1)}>+</button>
              </div>
              <button className="text-red-500" onClick={() => setCart(cart.filter(x => x.productoId !== c.productoId))}>✕</button>
            </div>
          ))}
        </div>
        <div className="border-t pt-3 space-y-2" style={{ borderColor: 'var(--border)' }}>
          <div className="flex justify-between items-center"><label className="text-sm">Descuento %</label><input type="number" className="input w-20 text-right" value={numVal(descuento)} onChange={e => setDescuento(e.target.value === '' ? 0 : Math.min(100, Math.max(0, +e.target.value)))} /></div>
          <div className="flex justify-between"><span>Total CUP:</span><span className="font-bold">{fmt(totalCUP)}</span></div>
          <div className="flex justify-between"><span>Total USD:</span><span className="font-bold">{fmt(totalUSD)}</span></div>
          <div className="flex gap-2"><button className="btn btn-ghost flex-1" onClick={() => { setCart([]); setDescuento(0); }}>Vaciar</button><button className="btn btn-ok flex-1" onClick={() => cart.length > 0 && setCobrarModal(true)}>💰 COBRAR</button></div>
        </div>
      </div>

      <Modal open={cobrarModal} onClose={() => setCobrarModal(false)} title="💰 Cobrar" wide>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded text-center" style={{ background: 'var(--bg3)' }}><p className="text-xs" style={{ color: 'var(--text2)' }}>TOTAL CUP</p><p className="text-2xl font-bold">{fmt(totalCUP)}</p></div>
            <div className="p-4 rounded text-center" style={{ background: 'var(--bg3)' }}><p className="text-xs" style={{ color: 'var(--text2)' }}>TOTAL USD</p><p className="text-2xl font-bold">{fmt(totalUSD)}</p></div>
          </div>

          {/* 1. SELECCIONAR MONEDA */}
          <div>
            <p className="text-sm font-semibold mb-2">1. Moneda:</p>
            <div className="flex gap-2">
              <button className={`btn flex-1 ${moneda === 'CUP' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMoneda('CUP')}>💵 CUP</button>
              <button className={`btn flex-1 ${moneda === 'USD' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMoneda('USD')}>💵 USD</button>
            </div>
          </div>

          {/* 2. SELECCIONAR MÉTODO */}
          <div>
            <p className="text-sm font-semibold mb-2">2. Método de pago:</p>
            <div className="grid grid-cols-2 gap-2">
              <button className={`btn ${metodoPago === 'efectivo' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMetodoPago('efectivo')}>💵 Efectivo</button>
              <button className={`btn ${metodoPago === 'transferencia' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMetodoPago('transferencia')}>💳 Transferencia</button>
              <button className={`btn ${metodoPago === 'dividido' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMetodoPago('dividido')}>🔀 Dividido</button>
              <button className={`btn ${metodoPago === 'pagarTarde' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMetodoPago('pagarTarde')}>📝 Pagar más tarde</button>
            </div>
          </div>

          {/* 3. CLIENTE (si es pagar más tarde) */}
          {(metodoPago === 'pagarTarde' || metodoPago === 'dividido') && (
            <div>
              <label className="text-xs font-medium">Cliente (requerido para pagar más tarde)</label>
              <select className="input" value={clienteId || ''} onChange={e => setClienteId(e.target.value ? +e.target.value : null)}>
                <option value="">Sin cliente</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          )}

          {/* 4. CONFIGURAR PAGO DIVIDIDO */}
          {metodoPago === 'dividido' && (
            <div className="p-3 rounded" style={{ background: 'var(--bg3)' }}>
              <p className="text-sm font-semibold mb-2">Dividir pago (Total: {fmt(totalMoneda)} {moneda})</p>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs">Efectivo</label><input type="number" className="input" value={numVal(moneda === 'CUP' ? pagos.efCUP : pagos.efUSD)} onChange={e => { const v = e.target.value === '' ? 0 : +e.target.value; if (moneda === 'CUP') setPagos(p => ({ ...p, efCUP: v })); else setPagos(p => ({ ...p, efUSD: v })); }} /></div>
                <div><label className="text-xs">Transferencia</label><input type="number" className="input" value={numVal(moneda === 'CUP' ? pagos.tfCUP : pagos.tfUSD)} onChange={e => { const v = e.target.value === '' ? 0 : +e.target.value; if (moneda === 'CUP') setPagos(p => ({ ...p, tfCUP: v })); else setPagos(p => ({ ...p, tfUSD: v })); }} /></div>
                <div><label className="text-xs">Pagar más tarde</label><input type="number" className="input" value={numVal(moneda === 'CUP' ? pagos.pagarCUP : pagos.pagarUSD)} onChange={e => { const v = e.target.value === '' ? 0 : +e.target.value; if (moneda === 'CUP') setPagos(p => ({ ...p, pagarCUP: v })); else setPagos(p => ({ ...p, pagarUSD: v })); }} /></div>
              </div>
              <p className="text-xs mt-2">Suma: {fmt((moneda === 'CUP' ? pagos.efCUP + pagos.tfCUP + pagos.pagarCUP : pagos.efUSD + pagos.tfUSD + pagos.pagarUSD))} / {fmt(totalMoneda)}</p>
            </div>
          )}

          {/* RESUMEN */}
          <div className="p-3 rounded" style={{ background: 'var(--bg3)' }}>
            <p className="text-sm font-semibold">Resumen:</p>
            {pagos.efCUP > 0 && <p className="text-xs">💵 Efectivo CUP: {fmt(pagos.efCUP)}</p>}
            {pagos.tfCUP > 0 && <p className="text-xs">💳 Transferencia CUP: {fmt(pagos.tfCUP)}</p>}
            {pagos.pagarCUP > 0 && <p className="text-xs">📝 Pagar más tarde CUP: {fmt(pagos.pagarCUP)}</p>}
            {pagos.efUSD > 0 && <p className="text-xs">💵 Efectivo USD: {fmt(pagos.efUSD)}</p>}
            {pagos.tfUSD > 0 && <p className="text-xs">💳 Transferencia USD: {fmt(pagos.tfUSD)}</p>}
            {pagos.pagarUSD > 0 && <p className="text-xs">📝 Pagar más tarde USD: {fmt(pagos.pagarUSD)}</p>}
          </div>
        </div>
        <div className="flex gap-2 mt-4 justify-end"><button className="btn btn-ghost" onClick={() => setCobrarModal(false)}>Cancelar</button><button className="btn btn-ok" onClick={confirmarVenta}>✓ Confirmar</button></div>
      </Modal>

      <Modal open={!!ticketVenta} onClose={() => setTicketVenta(null)} title="Ticket">
        {ticketVenta && (<div className="ticket"><div className="text-center mb-2"><p className="font-bold">{cfg.biz}</p><p>No: {ticketVenta.num}</p><p>{fmtDateTime(ticketVenta.fecha)}</p></div><hr className="my-2" />{ticketVenta.items.map((it, i) => (<div key={i} className="ticket-line"><span>{it.cantidad}× {it.nombre}</span><span>{fmt(it.subtotalCUP)}</span></div>))}<hr className="my-2" /><div className="ticket-line font-bold"><span>TOTAL CUP</span><span>{fmt(ticketVenta.totalCUP)}</span></div><div className="ticket-line"><span>TOTAL USD</span><span>{fmt(ticketVenta.totalUSD)}</span></div></div>)}
        <div className="flex gap-2 mt-4 justify-end"><button className="btn btn-primary" onClick={() => window.print()}>🖨️</button><button className="btn btn-ghost" onClick={() => setTicketVenta(null)}>Cerrar</button></div>
      </Modal>
    </div>
  );
}

// ============ SALES ============
function Sales({ cfg }: { cfg: Record<string, any> }) {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [cierresDiarios, setCierresDiarios] = useState<CierreDiario[]>([]);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [anularModal, setAnularModal] = useState<Venta | null>(null);
  const [viewTicket, setViewTicket] = useState<Venta | null>(null);
  const [motivo, setMotivo] = useState('');
  const [detalle, setDetalle] = useState('');
  const tasa = cfg.tasa || 350;

  const load = useCallback(async () => { 
    setVentas(await dbGetAll<Venta>('ventas'));
    setCierresDiarios(await dbGetAll<CierreDiario>('cierresDiarios'));
  }, []);
  useEffect(() => { load(); }, [load]);

  let filtered = [...ventas].sort((a, b) => b.fecha - a.fecha);
  if (search) filtered = filtered.filter(v => v.num.toLowerCase().includes(search.toLowerCase()) || v.clienteNombre.toLowerCase().includes(search.toLowerCase()));
  if (dateFrom) filtered = filtered.filter(v => v.fecha >= new Date(dateFrom).getTime());
  if (dateTo) filtered = filtered.filter(v => v.fecha <= new Date(dateTo).getTime() + 86400000);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const ventasHoy = ventas.filter(v => v.fecha >= today.getTime() && v.estado === 'pagada');
  
  // Usar cierre diario si existe, sino calcular
  const cierreHoy = cierresDiarios.find(c => c.fecha === today.getTime());
  const cajaCUPHoy = cierreHoy?.cajaCUP || ventasHoy.reduce((s, v) => s + v.pagos.efCUP + v.pagos.tfCUP, 0);
  const cajaUSDHoy = cierreHoy?.cajaUSD || ventasHoy.reduce((s, v) => s + v.pagos.efUSD + v.pagos.tfUSD, 0);
  const gananciaHoyCUP = cierreHoy?.gananciaBrutaCUP || ventasHoy.reduce((s, v) => s + v.items.reduce((si, it) => {
    const precioConDescuento = it.precioCUP * (1 - v.descuento / 100);
    return si + (precioConDescuento - it.pep) * it.cantidad;
  }, 0), 0);
  const gananciaHoyUSD = cierreHoy?.gananciaBrutaUSD || 0;
  const inversionHoyCUP = cierreHoy?.costoVentasCUP || 0;
  const inversionHoyUSD = cierreHoy?.costoVentasUSD || 0;
  
  // Desglose de pagos hoy
  const efectivoCUP = cierreHoy?.efectivoCUP || ventasHoy.reduce((s, v) => s + v.pagos.efCUP, 0);
  const efectivoUSD = cierreHoy?.efectivoUSD || ventasHoy.reduce((s, v) => s + v.pagos.efUSD, 0);
  const transferenciaCUP = cierreHoy?.transferenciaCUP || ventasHoy.reduce((s, v) => s + v.pagos.tfCUP, 0);
  const transferenciaUSD = cierreHoy?.transferenciaUSD || ventasHoy.reduce((s, v) => s + v.pagos.tfUSD, 0);
  const creditoCUP = cierreHoy?.creditoCUP || ventasHoy.reduce((s, v) => s + v.pagos.pagarCUP, 0);
  const creditoUSD = cierreHoy?.creditoUSD || ventasHoy.reduce((s, v) => s + v.pagos.pagarUSD, 0);

  // Totales del rango de fechas
  const totalRangoCUP = filtered.filter(v => v.estado === 'pagada').reduce((s, v) => s + v.totalCUP, 0);
  const totalRangoUSD = filtered.filter(v => v.estado === 'pagada').reduce((s, v) => s + v.totalUSD, 0);

  const anular = async () => {
    if (!anularModal || !motivo || !detalle.trim()) { showToast('Complete los campos', 'err'); return; }
    const productos = await dbGetAll<Producto>('productos');
    // Revertir stock a tienda (las ventas salen de tienda)
    for (const item of anularModal.items) { 
      const p = productos.find(pr => pr.id === item.productoId); 
      if (p) {
        const newStockTienda = (p.stockTienda || 0) + item.cantidad;
        const newStockAlmacen = p.stockAlmacen || 0;
        await dbPut('productos', { ...p, stock: newStockTienda + newStockAlmacen, stockTienda: newStockTienda, stockAlmacen: newStockAlmacen });
      }
    }
    if (anularModal.pagarMasTardeCUP > 0 || anularModal.pagarMasTardeUSD > 0) {
      const clientes = await dbGetAll<Cliente>('clientes');
      const cl = clientes.find(c => c.id === anularModal.clienteId);
      if (cl) await dbPut('clientes', { ...cl, saldoCUP: Math.max(0, cl.saldoCUP - anularModal.pagarMasTardeCUP), saldoUSD: Math.max(0, cl.saldoUSD - anularModal.pagarMasTardeUSD) });
    }
    await dbPut('ventas', { ...anularModal, estado: 'anulada' as const });
    await dbAdd('anulaciones', { ventaId: anularModal.id!, num: anularModal.num, fechaAnulacion: Date.now(), fechaOriginal: anularModal.fecha, totalCUP: anularModal.totalCUP, totalUSD: anularModal.totalUSD, motivo, detalle, estado: 'pendiente', items: anularModal.items, auditado: null } as Anulacion);
    showToast('Venta anulada', 'ok'); setAnularModal(null); setMotivo(''); setDetalle(''); load();
  };

  return (
    <div>
      {(cfg.mostrarCajaCUP !== false || cfg.mostrarCajaUSD !== false) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {cfg.mostrarCajaCUP !== false && (
            <div className="card p-4" style={{ borderLeft: '4px solid var(--ok)' }}>
              <p className="kpi-label">💵 Caja CUP Hoy</p>
              <p className="text-xl font-bold">{fmt(cajaCUPHoy)} CUP</p>
              <p className="equivalent">≈ {fmt(toUSD(cajaCUPHoy, tasa))} USD</p>
            </div>
          )}
          {cfg.mostrarCajaUSD !== false && (
            <div className="card p-4" style={{ borderLeft: '4px solid var(--info)' }}>
              <p className="kpi-label">💵 Caja USD Hoy</p>
              <p className="text-xl font-bold">{fmt(cajaUSDHoy)} USD</p>
              <p className="equivalent">≈ {fmt(toCUP(cajaUSDHoy, tasa))} CUP</p>
            </div>
          )}
        </div>
      )}

      {/* Totales combinados CUP + USD */}
      {(() => {
        const ventasTotalCUP = ventasHoy.reduce((s, v) => s + v.totalCUP + (v.totalUSD * tasa), 0);
        const reponerTotalCUP = inversionHoyCUP + (inversionHoyUSD * tasa);
        const gananciaTotalCUP = gananciaHoyCUP + (gananciaHoyUSD * tasa);
        const rangoTotalCUP = totalRangoCUP + (totalRangoUSD * tasa);
        
        return (
          <div className="grid-4 mb-4">
            <div className="kpi"><div className="kpi-label">📊 Ventas Hoy</div><div className="kpi-value">{ventasHoy.length}</div><p className="equivalent">{fmt(ventasTotalCUP)} CUP ≈ {fmt(toUSD(ventasTotalCUP, tasa))} USD</p></div>
            {cfg.mostrarInversion !== false && (
              <div className="kpi" style={{ borderLeftColor: 'var(--err)' }}><div className="kpi-label">🔄 Para Reponer</div><div className="kpi-value">{fmt(reponerTotalCUP)} CUP</div><p className="equivalent">≈ {fmt(toUSD(reponerTotalCUP, tasa))} USD</p></div>
            )}
            {cfg.mostrarGanancia !== false && (
              <div className="kpi" style={{ borderLeftColor: 'var(--warn)' }}><div className="kpi-label">💰 Ganancia</div><div className="kpi-value">{fmt(gananciaTotalCUP)} CUP</div><p className="equivalent">≈ {fmt(toUSD(gananciaTotalCUP, tasa))} USD</p></div>
            )}
            <div className="kpi" style={{ borderLeftColor: 'var(--info)' }}><div className="kpi-label">Total Rango</div><div className="kpi-value">{fmt(rangoTotalCUP)} CUP</div><p className="equivalent">≈ {fmt(toUSD(rangoTotalCUP, tasa))} USD</p></div>
          </div>
        );
      })()}
      
      {/* Desglose de Pagos Hoy */}
      {cfg.mostrarDesglosePagos !== false && (
        <div className="card p-4 mb-4">
          <h3 className="font-semibold mb-3">💳 Desglose de Pagos Hoy</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 rounded" style={{ background: 'var(--bg3)' }}>
              <p className="text-xs font-semibold mb-2">💵 Efectivo</p>
              <p className="text-lg font-bold">{fmt(efectivoCUP)} CUP</p>
              <p className="text-sm">{fmt(efectivoUSD)} USD</p>
            </div>
            <div className="p-3 rounded" style={{ background: 'var(--bg3)' }}>
              <p className="text-xs font-semibold mb-2">💳 Transferencia</p>
              <p className="text-lg font-bold">{fmt(transferenciaCUP)} CUP</p>
              <p className="text-sm">{fmt(transferenciaUSD)} USD</p>
            </div>
            <div className="p-3 rounded" style={{ background: 'var(--bg3)' }}>
              <p className="text-xs font-semibold mb-2">📝 Crédito (CxC)</p>
              <p className="text-lg font-bold">{fmt(creditoCUP)} CUP</p>
              <p className="text-sm">{fmt(creditoUSD)} USD</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-4">
        <input className="input max-w-xs" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
        <input type="date" className="input max-w-[150px]" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <input type="date" className="input max-w-[150px]" value={dateTo} onChange={e => setDateTo(e.target.value)} />
      </div>
      <div className="card table-wrap"><table><thead><tr><th>#</th><th>Fecha</th><th>Cliente</th><th>CUP</th><th>USD</th><th>Estado</th><th></th></tr></thead><tbody>{filtered.map(v => (<tr key={v.id} style={{ opacity: v.estado === 'anulada' ? 0.5 : 1 }}><td className="font-mono text-xs">{v.num}</td><td className="text-xs">{fmtDateTime(v.fecha)}</td><td>{v.clienteNombre || '-'}</td><td>{fmt(v.totalCUP)}</td><td>{fmt(v.totalUSD)}</td><td>{v.estado === 'pagada' ? <span className="badge badge-ok">Pagada</span> : <span className="badge badge-err">Anulada</span>}</td><td><button className="btn btn-ghost btn-sm" onClick={() => setViewTicket(v)}>👁️</button>{v.estado === 'pagada' && <button className="btn btn-ghost btn-sm" onClick={() => setAnularModal(v)}>🚫</button>}</td></tr>))}</tbody></table></div>

      <Modal open={!!anularModal} onClose={() => setAnularModal(null)} title="Anular Venta">
        {anularModal && (<div className="space-y-3"><p>Venta: <strong>{anularModal.num}</strong></p><div><label className="text-xs font-medium">Motivo *</label><select className="input" value={motivo} onChange={e => setMotivo(e.target.value)}><option value="">Seleccionar...</option><option>Error de digitación</option><option>Cliente se arrepintió</option><option>Producto defectuoso</option><option>Otro</option></select></div><div><label className="text-xs font-medium">Detalle *</label><textarea className="input" rows={3} value={detalle} onChange={e => setDetalle(e.target.value)} /></div></div>)}
        <div className="flex gap-2 mt-4 justify-end"><button className="btn btn-ghost" onClick={() => setAnularModal(null)}>Cancelar</button><button className="btn btn-err" onClick={anular}>Anular</button></div>
      </Modal>

      <Modal open={!!viewTicket} onClose={() => setViewTicket(null)} title="Detalle">
        {viewTicket && (<div className="ticket"><p className="font-bold">{viewTicket.num}</p><p>{fmtDateTime(viewTicket.fecha)}</p><hr className="my-2" />{viewTicket.items.map((it, i) => (<div key={i} className="ticket-line"><span>{it.cantidad}× {it.nombre}</span><span>{fmt(it.subtotalCUP)}</span></div>))}<hr className="my-2" /><div className="ticket-line font-bold"><span>TOTAL</span><span>{fmt(viewTicket.totalCUP)} CUP</span></div></div>)}
      </Modal>
    </div>
  );
}

// ============ DAILY CLOSE ============
function DailyClose({ cfg }: { cfg: Record<string, any> }) {
  const [cierresDiarios, setCierresDiarios] = useState<CierreDiario[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const tasa = cfg.tasa || 350;

  const load = useCallback(async () => {
    setCierresDiarios(await dbGetAll<CierreDiario>('cierresDiarios'));
    setGastos(await dbGetAll<Gasto>('gastos'));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Cierre de hoy
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fechaHoy = hoy.getTime();
  const cierreHoy = cierresDiarios.find(c => c.fecha === fechaHoy);
  
  // Gastos de hoy
  const gastosHoy = gastos.filter(g => {
    const fechaGasto = new Date(g.fecha);
    fechaGasto.setHours(0, 0, 0, 0);
    return fechaGasto.getTime() === fechaHoy;
  });
  const gastosTotal = gastosHoy.reduce((s, g) => s + g.montoCUP, 0);

  return (
    <div>
      <div className="card p-4 mb-4" style={{ borderLeft: '4px solid var(--primary)' }}>
        <p className="text-sm font-semibold">📆 Cierre del Día</p>
        <p className="text-xs" style={{ color: 'var(--text2)' }}>{fmtDate(fechaHoy)} - {cierreHoy ? `${cierreHoy.ventasIds.length} ventas realizadas` : 'Sin ventas'}</p>
      </div>

      {cierreHoy ? (
        <>
          {/* VENTAS */}
          <div className="grid-3 mb-4">
            <div className="kpi" style={{ borderLeftColor: 'var(--ok)' }}>
              <div className="kpi-label">💵 Ventas CUP</div>
              <div className="kpi-value">{fmt(cierreHoy.totalVentasCUP)}</div>
            </div>
            <div className="kpi" style={{ borderLeftColor: 'var(--info)' }}>
              <div className="kpi-label">💵 Ventas USD</div>
              <div className="kpi-value">{fmt(cierreHoy.totalVentasUSD)}</div>
            </div>
            <div className="kpi" style={{ borderLeftColor: 'var(--primary)' }}>
              <div className="kpi-label">📊 Ventas Total</div>
              <div className="kpi-value">{fmt(cierreHoy.totalVentasCUP + (cierreHoy.totalVentasUSD * tasa))}</div>
              <p className="equivalent">≈ {fmt(toUSD(cierreHoy.totalVentasCUP + (cierreHoy.totalVentasUSD * tasa), tasa))} USD</p>
            </div>
          </div>

          {/* INVERSIÓN */}
          <div className="grid-3 mb-4">
            <div className="kpi" style={{ borderLeftColor: 'var(--err)' }}>
              <div className="kpi-label">🔄 Inversión CUP</div>
              <div className="kpi-value">{fmt(cierreHoy.costoVentasCUP)}</div>
            </div>
            <div className="kpi" style={{ borderLeftColor: 'var(--err)' }}>
              <div className="kpi-label">🔄 Inversión USD</div>
              <div className="kpi-value">{fmt(cierreHoy.costoVentasUSD)}</div>
            </div>
            <div className="kpi" style={{ borderLeftColor: 'var(--err)' }}>
              <div className="kpi-label">🔄 Inversión Total</div>
              <div className="kpi-value">{fmt(cierreHoy.costoVentasCUP + (cierreHoy.costoVentasUSD * tasa))}</div>
              <p className="equivalent">≈ {fmt(toUSD(cierreHoy.costoVentasCUP + (cierreHoy.costoVentasUSD * tasa), tasa))} USD</p>
            </div>
          </div>

          {/* GANANCIA */}
          <div className="grid-3 mb-4">
            <div className="kpi" style={{ borderLeftColor: 'var(--warn)' }}>
              <div className="kpi-label">💰 Ganancia CUP</div>
              <div className="kpi-value">{fmt(cierreHoy.totalVentasCUP - cierreHoy.costoVentasCUP)}</div>
            </div>
            <div className="kpi" style={{ borderLeftColor: 'var(--warn)' }}>
              <div className="kpi-label">💰 Ganancia USD</div>
              <div className="kpi-value">{fmt(cierreHoy.totalVentasUSD - cierreHoy.costoVentasUSD)}</div>
            </div>
            <div className="kpi" style={{ borderLeftColor: 'var(--warn)' }}>
              <div className="kpi-label">💰 Ganancia Total</div>
              <div className="kpi-value">{fmt(cierreHoy.gananciaBrutaCUP + (cierreHoy.gananciaBrutaUSD * tasa))}</div>
              <p className="equivalent">≈ {fmt(toUSD(cierreHoy.gananciaBrutaCUP + (cierreHoy.gananciaBrutaUSD * tasa), tasa))} USD</p>
            </div>
          </div>

          {/* GASTOS Y GANANCIA NETA */}
          {(() => {
            const gananciaTotal = cierreHoy.gananciaBrutaCUP + (cierreHoy.gananciaBrutaUSD * tasa);
            const gananciaNeta = gananciaTotal - gastosTotal;
            
            return (
              <div className="grid-3 mb-4">
                <div className="kpi" style={{ borderLeftColor: 'var(--err)' }}>
                  <div className="kpi-label">💸 Gastos</div>
                  <div className="kpi-value">{fmt(gastosTotal)}</div>
                </div>
                <div className="kpi" style={{ borderLeftColor: gananciaNeta >= 0 ? 'var(--ok)' : 'var(--err)' }}>
                  <div className="kpi-label">💰 Ganancia Neta</div>
                  <div className="kpi-value">{fmt(gananciaNeta)}</div>
                  <p className="equivalent">≈ {fmt(toUSD(gananciaNeta, tasa))} USD</p>
                </div>
                <div></div>
              </div>
            );
          })()}

          {/* CAJA */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="kpi" style={{ borderLeftColor: 'var(--ok)' }}>
              <div className="kpi-label">💵 Caja CUP</div>
              <div className="kpi-value">{fmt(cierreHoy.cajaCUP)}</div>
            </div>
            <div className="kpi" style={{ borderLeftColor: 'var(--info)' }}>
              <div className="kpi-label">💵 Caja USD</div>
              <div className="kpi-value">{fmt(cierreHoy.cajaUSD)}</div>
            </div>
          </div>
        </>
      ) : (
        <div className="card p-8 text-center">
          <p className="text-lg" style={{ color: 'var(--text2)' }}>No hay ventas registradas hoy</p>
          <p className="text-sm mt-2" style={{ color: 'var(--text2)' }}>El cierre diario se genera automáticamente al realizar ventas</p>
        </div>
      )}

      {/* Histórico de cierres */}
      {cierresDiarios.length > 1 && (
        <div className="card p-4 mt-6">
          <h3 className="font-bold text-lg mb-4">📚 Histórico de Cierres</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Ventas CUP</th>
                  <th>Ventas USD</th>
                  <th>Ventas Total</th>
                  <th>Inversión</th>
                  <th>Ganancia</th>
                  <th>Caja CUP</th>
                  <th>Caja USD</th>
                </tr>
              </thead>
              <tbody>
                {[...cierresDiarios].sort((a, b) => b.fecha - a.fecha).map(c => {
                  const ventasTotal = c.totalVentasCUP + (c.totalVentasUSD * tasa);
                  const inversionTotal = c.costoVentasCUP + (c.costoVentasUSD * tasa);
                  const gananciaTotal = c.gananciaBrutaCUP + (c.gananciaBrutaUSD * tasa);
                  
                  return (
                    <tr key={c.id}>
                      <td className="text-xs">{fmtDate(c.fecha)}</td>
                      <td>{fmt(c.totalVentasCUP)}</td>
                      <td>{fmt(c.totalVentasUSD)}</td>
                      <td className="font-semibold">{fmt(ventasTotal)}</td>
                      <td style={{ color: 'var(--err)' }}>{fmt(inversionTotal)}</td>
                      <td style={{ color: 'var(--ok)' }} className="font-bold">{fmt(gananciaTotal)}</td>
                      <td>{fmt(c.cajaCUP)}</td>
                      <td>{fmt(c.cajaUSD)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ WEEKLY CLOSE ============
function WeeklyClose({ cfg }: { cfg: Record<string, any> }) {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [cierresDiarios, setCierresDiarios] = useState<CierreDiario[]>([]);
  const [guardado, setGuardado] = useState(false);
  const tasa = cfg.tasa || 350;
  const pctDep = cfg.pctDependienta || 0;

  const load = useCallback(async () => {
    setVentas(await dbGetAll<Venta>('ventas'));
    setGastos(await dbGetAll<Gasto>('gastos'));
    setCierresDiarios(await dbGetAll<CierreDiario>('cierresDiarios'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const week = getWeekRange();
  const ventasSemana = ventas.filter(v => v.fecha >= week.start && v.fecha <= week.end && v.estado === 'pagada');
  const gastosSemana = gastos.filter(g => g.fecha >= week.start && g.fecha <= week.end);
  
  // Cierres diarios de la semana
  const cierresSemana = cierresDiarios.filter(c => c.fecha >= week.start && c.fecha <= week.end);

  // VENTAS
  const ventasCUP = cierresSemana.reduce((s, c) => s + c.totalVentasCUP, 0) || ventasSemana.reduce((s, v) => s + v.totalCUP, 0);
  const ventasUSD = cierresSemana.reduce((s, c) => s + c.totalVentasUSD, 0) || ventasSemana.reduce((s, v) => s + v.totalUSD, 0);
  const ventasTotal = ventasCUP + (ventasUSD * tasa); // Todo en CUP
  
  // INVERSIÓN (Costo de lo vendido)
  const inversionCUP = cierresSemana.reduce((s, c) => s + c.costoVentasCUP, 0) || 0;
  const inversionUSD = cierresSemana.reduce((s, c) => s + c.costoVentasUSD, 0) || 0;
  const inversionTotal = inversionCUP + (inversionUSD * tasa); // Todo en CUP
  
  // GANANCIA (Ventas - Inversión)
  const gananciaCUP = ventasCUP - inversionCUP;
  const gananciaUSD = ventasUSD - inversionUSD;
  const gananciaTotal = ventasTotal - inversionTotal;
  
  // GASTOS
  const gastosTotal = gastosSemana.reduce((s, g) => s + g.montoCUP, 0);
  
  // GANANCIA NETA (Ganancia - Gastos)
  const gananciaNeta = gananciaTotal - gastosTotal;

  // DISTRIBUCIÓN (de la ganancia neta)
  const accionista1 = gananciaNeta * 0.5;
  const accionista2 = gananciaNeta * 0.5;
  const dependienta = accionista2 * (pctDep / 100);
  const accionista2Neto = accionista2 - dependienta;

  // CAJA
  const efectivoCUP = cierresSemana.reduce((s, c) => s + c.efectivoCUP, 0) || ventasSemana.reduce((s, v) => s + v.pagos.efCUP, 0);
  const efectivoUSD = cierresSemana.reduce((s, c) => s + c.efectivoUSD, 0) || ventasSemana.reduce((s, v) => s + v.pagos.efUSD, 0);
  const transferenciaCUP = cierresSemana.reduce((s, c) => s + c.transferenciaCUP, 0) || ventasSemana.reduce((s, v) => s + v.pagos.tfCUP, 0);
  const transferenciaUSD = cierresSemana.reduce((s, c) => s + c.transferenciaUSD, 0) || ventasSemana.reduce((s, v) => s + v.pagos.tfUSD, 0);
  const creditoCUP = cierresSemana.reduce((s, c) => s + c.creditoCUP, 0) || ventasSemana.reduce((s, v) => s + v.pagos.pagarCUP, 0);
  const creditoUSD = cierresSemana.reduce((s, c) => s + c.creditoUSD, 0) || ventasSemana.reduce((s, v) => s + v.pagos.pagarUSD, 0);

  const cajaCUP = efectivoCUP + transferenciaCUP;
  const cajaUSD = efectivoUSD + transferenciaUSD;

  const guardarCierre = async () => {
    const cierre: CierreSemanal = {
      semanaInicio: week.start, semanaFin: week.end,
      ventasIds: ventasSemana.map(v => v.id!),
      totalVentasCUP: ventasCUP, totalVentasUSD: ventasUSD,
      gananciaBrutaCUP: gananciaTotal, gananciaBrutaUSD: toUSD(gananciaTotal, tasa),
      totalGastosCUP: gastosTotal, totalGastosUSD: 0,
      gananciaNetaCUP: gananciaNeta, gananciaNetaUSD: toUSD(gananciaNeta, tasa),
      inversionInventarioCUP: inversionTotal, inversionInventarioUSD: toUSD(inversionTotal, tasa),
      accionista1, accionista2, dependienta, accionista2Neto,
      cajaCUP, cajaUSD, tasaUsada: tasa, creado: Date.now()
    };
    await dbAdd('cierres', cierre);
    showToast('Cierre guardado en histórico', 'ok');
    setGuardado(true);
  };

  return (
    <div>
      <div className="card p-4 mb-4" style={{ borderLeft: '4px solid var(--primary)' }}>
        <p className="text-sm font-semibold">📅 Semana: {week.startStr} - {week.endStr}</p>
        <p className="text-xs" style={{ color: 'var(--text2)' }}>{ventasSemana.length} ventas realizadas</p>
      </div>

      {/* VENTAS */}
      <div className="grid-3 mb-4">
        <div className="kpi" style={{ borderLeftColor: 'var(--ok)' }}>
          <div className="kpi-label">💵 Ventas CUP</div>
          <div className="kpi-value">{fmt(ventasCUP)}</div>
        </div>
        <div className="kpi" style={{ borderLeftColor: 'var(--info)' }}>
          <div className="kpi-label">💵 Ventas USD</div>
          <div className="kpi-value">{fmt(ventasUSD)}</div>
        </div>
        <div className="kpi" style={{ borderLeftColor: 'var(--primary)' }}>
          <div className="kpi-label">📊 Ventas Total</div>
          <div className="kpi-value">{fmt(ventasTotal)}</div>
          <p className="equivalent">≈ {fmt(toUSD(ventasTotal, tasa))} USD</p>
        </div>
      </div>

      {/* INVERSIÓN */}
      <div className="grid-3 mb-4">
        <div className="kpi" style={{ borderLeftColor: 'var(--err)' }}>
          <div className="kpi-label">🔄 Inversión CUP</div>
          <div className="kpi-value">{fmt(inversionCUP)}</div>
        </div>
        <div className="kpi" style={{ borderLeftColor: 'var(--err)' }}>
          <div className="kpi-label">🔄 Inversión USD</div>
          <div className="kpi-value">{fmt(inversionUSD)}</div>
        </div>
        <div className="kpi" style={{ borderLeftColor: 'var(--err)' }}>
          <div className="kpi-label">🔄 Inversión Total</div>
          <div className="kpi-value">{fmt(inversionTotal)}</div>
          <p className="equivalent">≈ {fmt(toUSD(inversionTotal, tasa))} USD</p>
        </div>
      </div>

      {/* GANANCIA */}
      <div className="grid-3 mb-4">
        <div className="kpi" style={{ borderLeftColor: 'var(--warn)' }}>
          <div className="kpi-label">💰 Ganancia CUP</div>
          <div className="kpi-value">{fmt(gananciaCUP)}</div>
        </div>
        <div className="kpi" style={{ borderLeftColor: 'var(--warn)' }}>
          <div className="kpi-label">💰 Ganancia USD</div>
          <div className="kpi-value">{fmt(gananciaUSD)}</div>
        </div>
        <div className="kpi" style={{ borderLeftColor: 'var(--warn)' }}>
          <div className="kpi-label">💰 Ganancia Total</div>
          <div className="kpi-value">{fmt(gananciaTotal)}</div>
          <p className="equivalent">≈ {fmt(toUSD(gananciaTotal, tasa))} USD</p>
        </div>
      </div>

      {/* GASTOS Y GANANCIA NETA */}
      <div className="grid-3 mb-4">
        <div className="kpi" style={{ borderLeftColor: 'var(--err)' }}>
          <div className="kpi-label">💸 Gastos</div>
          <div className="kpi-value">{fmt(gastosTotal)}</div>
        </div>
        <div className="kpi" style={{ borderLeftColor: gananciaNeta >= 0 ? 'var(--ok)' : 'var(--err)' }}>
          <div className="kpi-label">💰 Ganancia Neta</div>
          <div className="kpi-value">{fmt(gananciaNeta)}</div>
          <p className="equivalent">≈ {fmt(toUSD(gananciaNeta, tasa))} USD</p>
        </div>
        <div></div>
      </div>

      {/* CAJA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="kpi" style={{ borderLeftColor: 'var(--ok)' }}>
          <div className="kpi-label">💵 Caja CUP</div>
          <div className="kpi-value">{fmt(cajaCUP)}</div>
        </div>
        <div className="kpi" style={{ borderLeftColor: 'var(--info)' }}>
          <div className="kpi-label">💵 Caja USD</div>
          <div className="kpi-value">{fmt(cajaUSD)}</div>
        </div>
      </div>

      {/* DISTRIBUCIÓN */}
      <div className="card p-6 mb-6">
        <h3 className="font-bold text-lg mb-4">📊 Distribución de Ganancia Neta</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded" style={{ background: 'var(--bg3)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--primary)' }}>👤 {cfg.accionista1Nombre || 'Accionista 1'} (50%)</p>
            <p className="text-xl font-bold">{fmt(accionista1)} CUP</p>
            <p className="text-xs" style={{ color: 'var(--text2)' }}>≈ {fmt(toUSD(accionista1, tasa))} USD</p>
          </div>
          <div className="p-4 rounded" style={{ background: 'var(--bg3)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--ok)' }}>👤 {cfg.accionista2Nombre || 'Accionista 2'} - NETO</p>
            <p className="text-xl font-bold" style={{ color: 'var(--ok)' }}>{fmt(accionista2Neto)} CUP</p>
            {pctDep > 0 && <p className="text-xs" style={{ color: 'var(--text2)' }}>(Bruto: {fmt(accionista2)} - Dependienta: {fmt(dependienta)})</p>}
            <p className="text-xs" style={{ color: 'var(--text2)' }}>≈ {fmt(toUSD(accionista2Neto, tasa))} USD</p>
          </div>
          {pctDep > 0 && (
            <div className="p-4 rounded" style={{ background: 'var(--bg3)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--warn)' }}>💁 {cfg.dependientaNombre || 'Dependienta'} ({pctDep}% del Acc. 2)</p>
              <p className="text-xl font-bold">{fmt(dependienta)} CUP</p>
              <p className="text-xs" style={{ color: 'var(--text2)' }}>≈ {fmt(toUSD(dependienta, tasa))} USD</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button className="btn btn-primary" onClick={guardarCierre} disabled={guardado}>{guardado ? '✓ Guardado' : '💾 Guardar Cierre en Histórico'}</button>
      </div>
    </div>
  );
}

// ============ CIERRE HISTORY ============
function CierreHistory({ cfg }: { cfg: Record<string, any> }) {
  const [cierres, setCierres] = useState<CierreSemanal[]>([]);
  const [viewDetail, setViewDetail] = useState<CierreSemanal | null>(null);
  const tasa = cfg.tasa || 350;

  const load = useCallback(async () => { setCierres(await dbGetAll<CierreSemanal>('cierres')); }, []);
  useEffect(() => { load(); }, [load]);

  const del = async (c: CierreSemanal) => {
    if (!confirm('¿Eliminar este cierre?')) return;
    await dbDelete('cierres', c.id!); load();
  };

  return (
    <div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Semana</th><th>Ventas</th><th>Ganancia Bruta</th><th>Gastos</th><th>Ganancia Neta</th><th>Inversión</th><th></th></tr></thead>
          <tbody>
            {[...cierres].sort((a, b) => b.creado - a.creado).map(c => (
              <tr key={c.id}>
                <td className="text-xs">{fmtDate(c.semanaInicio)} - {fmtDate(c.semanaFin)}</td>
                <td>{c.ventasIds.length}</td>
                <td>{fmt(c.gananciaBrutaCUP)}</td>
                <td>{fmt(c.totalGastosCUP)}</td>
                <td className="font-bold">{fmt(c.gananciaNetaCUP)}</td>
                <td>{fmt(c.inversionInventarioCUP)}</td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => setViewDetail(c)}>👁️</button> <button className="btn btn-ghost btn-sm" onClick={() => del(c)}>🗑️</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cierres.length === 0 && <p className="text-center py-8" style={{ color: 'var(--text2)' }}>Sin cierres guardados</p>}

      <Modal open={!!viewDetail} onClose={() => setViewDetail(null)} title="Detalle del Cierre" wide>
        {viewDetail && (
          <div className="space-y-3">
            <p><strong>Semana:</strong> {fmtDate(viewDetail.semanaInicio)} - {fmtDate(viewDetail.semanaFin)}</p>
            <p><strong>Tasa usada:</strong> {viewDetail.tasaUsada} CUP/USD</p>
            <hr />
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-xs" style={{ color: 'var(--text2)' }}>Total Ventas</p><p className="font-bold">{fmt(viewDetail.totalVentasCUP)} CUP / {fmt(viewDetail.totalVentasUSD)} USD</p></div>
              <div><p className="text-xs" style={{ color: 'var(--text2)' }}>Ganancia Bruta</p><p className="font-bold">{fmt(viewDetail.gananciaBrutaCUP)} CUP</p></div>
              <div><p className="text-xs" style={{ color: 'var(--text2)' }}>Gastos</p><p className="font-bold">{fmt(viewDetail.totalGastosCUP)} CUP</p></div>
              <div><p className="text-xs" style={{ color: 'var(--text2)' }}>Ganancia Neta</p><p className="font-bold">{fmt(viewDetail.gananciaNetaCUP)} CUP</p></div>
              <div><p className="text-xs" style={{ color: 'var(--text2)' }}>Inventario</p><p className="font-bold">{fmt(viewDetail.inversionInventarioCUP)} CUP / {fmt(viewDetail.inversionInventarioUSD)} USD</p></div>
              <div><p className="text-xs" style={{ color: 'var(--text2)' }}>Caja</p><p className="font-bold">{fmt(viewDetail.cajaCUP)} CUP / {fmt(viewDetail.cajaUSD)} USD</p></div>
            </div>
            <hr />
            <h4 className="font-semibold">Distribución:</h4>
            <p>{cfg.accionista1Nombre || 'Accionista 1'}: {fmt(viewDetail.accionista1)} CUP</p>
            <p>{cfg.accionista2Nombre || 'Accionista 2'}: {fmt(viewDetail.accionista2)} CUP</p>
            <p>{cfg.dependientaNombre || 'Dependienta'}: {fmt(viewDetail.dependienta)} CUP</p>
            <p>{cfg.accionista2Nombre || 'Accionista 2'} Neto: {fmt(viewDetail.accionista2Neto)} CUP</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ============ CANCELLATIONS ============
function Cancellations({ cfg }: { cfg: Record<string, any> }) {
  const [anulaciones, setAnulaciones] = useState<Anulacion[]>([]);
  const [viewDetail, setViewDetail] = useState<Anulacion | null>(null);
  const load = useCallback(async () => { setAnulaciones(await dbGetAll<Anulacion>('anulaciones')); }, []);
  useEffect(() => { load(); }, [load]);
  const auditar = async (a: Anulacion) => { await dbPut('anulaciones', { ...a, estado: 'revertida' as const, auditado: Date.now() }); showToast('Auditada', 'ok'); load(); };
  return (
    <div>
      <div className="grid-3 mb-4"><div className="kpi" style={{ borderLeftColor: 'var(--warn)' }}><div className="kpi-label">Pendientes</div><div className="kpi-value">{anulaciones.filter(a => a.estado === 'pendiente').length}</div></div><div className="kpi" style={{ borderLeftColor: 'var(--ok)' }}><div className="kpi-label">Auditadas</div><div className="kpi-value">{anulaciones.filter(a => a.estado === 'revertida').length}</div></div><div className="kpi"><div className="kpi-label">Total</div><div className="kpi-value">{anulaciones.length}</div></div></div>
      <div className="card table-wrap"><table><thead><tr><th>Venta</th><th>Fecha</th><th>CUP</th><th>USD</th><th>Motivo</th><th>Estado</th><th></th></tr></thead><tbody>{[...anulaciones].sort((a, b) => b.fechaAnulacion - a.fechaAnulacion).map(a => (<tr key={a.id}><td className="font-mono text-xs">{a.num}</td><td className="text-xs">{fmtDateTime(a.fechaAnulacion)}</td><td>{fmt(a.totalCUP)}</td><td>{fmt(a.totalUSD)}</td><td className="text-xs">{a.motivo}</td><td>{a.estado === 'pendiente' ? <span className="badge badge-warn">Pendiente</span> : <span className="badge badge-ok">Revertida</span>}</td><td><button className="btn btn-ghost btn-sm" onClick={() => setViewDetail(a)}>👁️</button>{a.estado === 'pendiente' && <button className="btn btn-ok btn-sm" onClick={() => auditar(a)}>✓</button>}</td></tr>))}</tbody></table></div>
      <Modal open={!!viewDetail} onClose={() => setViewDetail(null)} title="Detalle">{viewDetail && (<div className="space-y-2"><p><strong>Venta:</strong> {viewDetail.num}</p><p><strong>Motivo:</strong> {viewDetail.motivo}</p><p><strong>Detalle:</strong> {viewDetail.detalle}</p><hr />{viewDetail.items.map((it, i) => (<div key={i} className="flex justify-between text-sm"><span>{it.cantidad}× {it.nombre}</span><span>{fmt(it.subtotalCUP)}</span></div>))}</div>)}</Modal>
    </div>
  );
}

// ============ CLIENTS ============
function Clients({ cfg }: { cfg: Record<string, any> }) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [modal, setModal] = useState(false);
  const [abonoModal, setAbonoModal] = useState<Cliente | null>(null);
  const [editItem, setEditItem] = useState<Cliente | null>(null);
  const [form, setForm] = useState<Partial<Cliente>>({});
  const [abonoCUP, setAbonoCUP] = useState(0);
  const [abonoUSD, setAbonoUSD] = useState(0);
  const tasa = cfg.tasa || 350;

  const load = useCallback(async () => { setClientes(await dbGetAll<Cliente>('clientes')); }, []);
  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditItem(null); setForm({ nombre: '', telefono: '', email: '', direccion: '', notas: '', saldoCUP: 0, saldoUSD: 0, compras: 0, ultimaCompra: 0 }); setModal(true); };
  const openEdit = (c: Cliente) => { setEditItem(c); setForm({ ...c }); setModal(true); };

  const save = async () => {
    if (!form.nombre?.trim()) { showToast('Nombre requerido', 'err'); return; }
    if (editItem) { await dbPut('clientes', { ...editItem, ...form }); showToast('Actualizado', 'ok'); }
    else { await dbAdd('clientes', { ...form, creado: Date.now() } as Cliente); showToast('Creado', 'ok'); }
    setModal(false); load();
  };

  const del = async (c: Cliente) => { if (!confirm(`¿Eliminar "${c.nombre}"?`)) return; await dbDelete('clientes', c.id!); load(); };

  const registrarAbono = async () => {
    if (!abonoModal || (abonoCUP <= 0 && abonoUSD <= 0)) { showToast('Monto inválido', 'err'); return; }
    
    // Actualizar saldo del cliente
    await dbPut('clientes', { 
      ...abonoModal, 
      saldoCUP: Math.max(0, abonoModal.saldoCUP - abonoCUP), 
      saldoUSD: Math.max(0, abonoModal.saldoUSD - abonoUSD) 
    });
    
    // Actualizar cierre diario del día (el abono entra a caja)
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fechaHoy = hoy.getTime();
    
    const cierresDiarios = await dbGetAll<CierreDiario>('cierresDiarios');
    let cierreHoy = cierresDiarios.find(c => c.fecha === fechaHoy);
    
    if (cierreHoy) {
      // Actualizar cierre existente
      cierreHoy.cajaCUP += abonoCUP;
      cierreHoy.cajaUSD += abonoUSD;
      cierreHoy.efectivoCUP += abonoCUP;
      cierreHoy.efectivoUSD += abonoUSD;
      await dbPut('cierresDiarios', cierreHoy);
    } else {
      // Crear nuevo cierre diario solo con el abono
      const nuevoCierre: CierreDiario = {
        fecha: fechaHoy,
        ventasIds: [],
        totalVentasCUP: 0,
        totalVentasUSD: 0,
        costoVentasCUP: 0,
        costoVentasUSD: 0,
        gananciaBrutaCUP: 0,
        gananciaBrutaUSD: 0,
        cajaCUP: abonoCUP,
        cajaUSD: abonoUSD,
        efectivoCUP: abonoCUP,
        efectivoUSD: abonoUSD,
        transferenciaCUP: 0,
        transferenciaUSD: 0,
        creditoCUP: 0,
        creditoUSD: 0,
        tasaUsada: tasa,
        creado: Date.now()
      };
      await dbAdd('cierresDiarios', nuevoCierre);
    }
    
    showToast('Abono registrado y actualizado en caja', 'ok'); 
    setAbonoModal(null); 
    setAbonoCUP(0); 
    setAbonoUSD(0); 
    load();
  };

  const conSaldo = clientes.filter(c => c.saldoCUP > 0 || c.saldoUSD > 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-4"><p className="text-sm" style={{ color: 'var(--text2)' }}>{clientes.length} clientes | {conSaldo.length} con saldo</p><button className="btn btn-primary" onClick={openNew}>+ Nuevo</button></div>
      {conSaldo.length > 0 && (<div className="card p-4 mb-4"><h3 className="font-semibold mb-3">💳 Cuentas por Cobrar</h3><div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Saldo CUP</th><th>Saldo USD</th><th></th></tr></thead><tbody>{conSaldo.map(c => (<tr key={c.id}><td className="font-medium">{c.nombre}</td><td>{fmt(c.saldoCUP)}<p className="equivalent">≈ {fmt(toUSD(c.saldoCUP, tasa))} USD</p></td><td>{fmt(c.saldoUSD)}<p className="equivalent">≈ {fmt(toCUP(c.saldoUSD, tasa))} CUP</p></td><td><button className="btn btn-ok btn-sm" onClick={() => setAbonoModal(c)}>💵 Abono</button> <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>✏️</button></td></tr>))}</tbody></table></div></div>)}
      <div className="card table-wrap"><table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Saldo CUP</th><th>Saldo USD</th><th></th></tr></thead><tbody>{clientes.map(c => (<tr key={c.id}><td>{c.nombre}</td><td>{c.telefono}</td><td>{fmt(c.saldoCUP)}</td><td>{fmt(c.saldoUSD)}</td><td><button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>✏️</button> <button className="btn btn-ghost btn-sm" onClick={() => del(c)}>🗑️</button></td></tr>))}</tbody></table></div>
      <Modal open={modal} onClose={() => setModal(false)} title={editItem ? 'Editar' : 'Nuevo Cliente'}><div className="space-y-3"><div><label className="text-xs font-medium">Nombre *</label><input className="input" value={form.nombre || ''} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} /></div><div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-medium">Teléfono</label><input className="input" value={form.telefono || ''} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} /></div><div><label className="text-xs font-medium">Email</label><input className="input" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div></div><div><label className="text-xs font-medium">Dirección</label><input className="input" value={form.direccion || ''} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} /></div><div><label className="text-xs font-medium">Notas</label><textarea className="input" rows={2} value={form.notas || ''} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} /></div></div><div className="flex gap-2 mt-4 justify-end"><button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={save}>Guardar</button></div></Modal>
      <Modal open={!!abonoModal} onClose={() => setAbonoModal(null)} title="💵 Abono">{abonoModal && (<div className="space-y-3"><p>Cliente: <strong>{abonoModal.nombre}</strong></p><p>Saldo: {fmt(abonoModal.saldoCUP)} CUP / {fmt(abonoModal.saldoUSD)} USD</p><div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-medium">Abono CUP</label><input type="number" className="input" value={numVal(abonoCUP)} onChange={e => setAbonoCUP(e.target.value === '' ? 0 : +e.target.value)} /></div><div><label className="text-xs font-medium">Abono USD</label><input type="number" className="input" value={numVal(abonoUSD)} onChange={e => setAbonoUSD(e.target.value === '' ? 0 : +e.target.value)} /></div></div></div>)}<div className="flex gap-2 mt-4 justify-end"><button className="btn btn-ghost" onClick={() => setAbonoModal(null)}>Cancelar</button><button className="btn btn-ok" onClick={registrarAbono}>Registrar</button></div></Modal>
    </div>
  );
}

// ============ METRICS ============
function Metrics({ cfg }: { cfg: Record<string, any> }) {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const tasa = cfg.tasa || 350;
  const pctDep = cfg.pctDependienta || 0;

  const load = useCallback(async () => { setVentas(await dbGetAll<Venta>('ventas')); setProductos(await dbGetAll<Producto>('productos')); setGastos(await dbGetAll<Gasto>('gastos')); }, []);
  useEffect(() => { load(); }, [load]);

  const week = getWeekRange();
  const ventasSemana = ventas.filter(v => v.fecha >= week.start && v.fecha <= week.end && v.estado === 'pagada');
  const gastosSemana = gastos.filter(g => g.fecha >= week.start && g.fecha <= week.end);

  const totalCUP = ventasSemana.reduce((s, v) => s + v.totalCUP, 0);
  const totalUSD = ventasSemana.reduce((s, v) => s + v.totalUSD, 0);
  const ganancia = ventasSemana.reduce((s, v) => s + v.items.reduce((si, it) => {
    const precioConDescuento = it.precioCUP * (1 - v.descuento / 100);
    return si + (precioConDescuento - it.pep) * it.cantidad;
  }, 0), 0);
  const gastosTotal = gastosSemana.reduce((s, g) => s + g.montoCUP, 0);
  const utilidad = ganancia - gastosTotal;
  const inversion = productos.reduce((s, p) => s + (p.stock * p.pep), 0);

  const accionista1 = utilidad * 0.5;
  const accionista2 = utilidad * 0.5;
  const dependienta = accionista2 * (pctDep / 100);

  return (
    <div>
      <div className="card p-4 mb-4" style={{ borderLeft: '4px solid var(--primary)' }}><p className="text-sm font-semibold">📅 Semana: {week.startStr} - {week.endStr}</p></div>
      
      {/* Totales combinados CUP + USD */}
      {(() => {
        const ventasTotalCUP = totalCUP + (totalUSD * tasa);
        
        return (
          <div className="grid-3 mb-6">
            <div className="kpi"><div className="kpi-label">📊 Ventas</div><div className="kpi-value">{fmt(ventasTotalCUP)}</div><p className="equivalent">≈ {fmt(toUSD(ventasTotalCUP, tasa))} USD</p></div>
            {cfg.mostrarGanancia !== false && (
              <div className="kpi" style={{ borderLeftColor: 'var(--warn)' }}><div className="kpi-label">💰 Ganancia</div><div className="kpi-value">{fmt(ganancia)}</div><p className="equivalent">≈ {fmt(toUSD(ganancia, tasa))} USD</p></div>
            )}
            {cfg.mostrarGanancia !== false && (
              <div className="kpi" style={{ borderLeftColor: utilidad >= 0 ? 'var(--ok)' : 'var(--err)' }}><div className="kpi-label">💰 Ganancia Neta</div><div className="kpi-value">{fmt(utilidad)}</div><p className="equivalent">(Ganancia - Gastos)</p></div>
            )}
          </div>
        );
      })()}
      
      {cfg.mostrarDistribucionGanancias !== false && (
        <div className="grid-3 mb-6">
          <div className="kpi" style={{ borderLeftColor: 'var(--primary)' }}><div className="kpi-label">{cfg.accionista1Nombre || 'Accionista 1'} (50%)</div><div className="kpi-value">{fmt(accionista1)}</div></div>
          <div className="kpi" style={{ borderLeftColor: 'var(--ok)' }}><div className="kpi-label">{cfg.accionista2Nombre || 'Accionista 2'} (50%)</div><div className="kpi-value">{fmt(accionista2)}</div>{pctDep > 0 && <p className="text-xs">Dep: -{fmt(dependienta)} | Neto: {fmt(accionista2 - dependienta)}</p>}</div>
          {pctDep > 0 && (
            <div className="kpi" style={{ borderLeftColor: 'var(--warn)' }}><div className="kpi-label">💁 {cfg.dependientaNombre || 'Dependienta'} ({pctDep}% del Acc. 2)</div><div className="kpi-value">{fmt(dependienta)} CUP</div></div>
          )}
        </div>
      )}

      {/* Métricas adicionales del mes */}
      {(() => {
        // Productos más vendidos del mes
        const inicioMes = new Date();
        inicioMes.setDate(1);
        inicioMes.setHours(0, 0, 0, 0);
        
        const ventasMes = ventas.filter(v => v.fecha >= inicioMes.getTime() && v.estado === 'pagada');
        
        const productosMes: Record<number, { nombre: string; cantidad: number; ventas: number; ganancia: number; categoria: string }> = {};
        ventasMes.forEach(v => {
          v.items.forEach(item => {
            if (!productosMes[item.productoId]) {
              const prod = productos.find(p => p.id === item.productoId);
              productosMes[item.productoId] = { 
                nombre: item.nombre, 
                cantidad: 0, 
                ventas: 0, 
                ganancia: 0,
                categoria: prod?.categoria || 'Sin categoría'
              };
            }
            productosMes[item.productoId].cantidad += item.cantidad;
            productosMes[item.productoId].ventas += item.subtotalCUP;
            const gananciaItem = (item.precioCUP - item.pep) * item.cantidad * (1 - v.descuento / 100);
            productosMes[item.productoId].ganancia += gananciaItem;
          });
        });
        
        const topVentasMes = Object.entries(productosMes)
          .sort((a, b) => b[1].cantidad - a[1].cantidad)
          .slice(0, 10);
        
        const topGananciaMes = Object.entries(productosMes)
          .sort((a, b) => b[1].ganancia - a[1].ganancia)
          .slice(0, 10);
        
        // Categorías más rentables
        const categoriasMes: Record<string, { ventas: number; ganancia: number }> = {};
        Object.values(productosMes).forEach(data => {
          if (!categoriasMes[data.categoria]) {
            categoriasMes[data.categoria] = { ventas: 0, ganancia: 0 };
          }
          categoriasMes[data.categoria].ventas += data.ventas;
          categoriasMes[data.categoria].ganancia += data.ganancia;
        });
        
        const topCategorias = Object.entries(categoriasMes)
          .sort((a, b) => b[1].ganancia - a[1].ganancia)
          .slice(0, 5);
        
        // Margen de ganancia promedio
        const margenPromedio = totalCUP > 0 ? (ganancia / totalCUP) * 100 : 0;
        
        // Clientes más frecuentes
        const clientesFrecuentes: Record<number, { nombre: string; compras: number; total: number }> = {};
        ventasMes.forEach(v => {
          if (v.clienteId) {
            if (!clientesFrecuentes[v.clienteId]) {
              clientesFrecuentes[v.clienteId] = { nombre: v.clienteNombre, compras: 0, total: 0 };
            }
            clientesFrecuentes[v.clienteId].compras += 1;
            clientesFrecuentes[v.clienteId].total += v.totalCUP;
          }
        });
        
        const topClientes = Object.entries(clientesFrecuentes)
          .sort((a, b) => b[1].compras - a[1].compras)
          .slice(0, 5);
        
        return (
          <>
            {/* Margen de ganancia */}
            <div className="card p-4 mb-6">
              <h3 className="font-semibold mb-3">📊 Margen de Ganancia Promedio</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold" style={{ color: margenPromedio >= 30 ? 'var(--ok)' : margenPromedio >= 20 ? 'var(--warn)' : 'var(--err)' }}>
                    {fmt(margenPromedio, 1)}%
                  </p>
                  <p className="text-sm" style={{ color: 'var(--text2)' }}>Ganancia / Ventas</p>
                </div>
                <div className="text-6xl">
                  {margenPromedio >= 30 ? '💎' : margenPromedio >= 20 ? '👍' : '⚠️'}
                </div>
              </div>
            </div>
            
            {/* Top productos y categorías */}
            {topVentasMes.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="card p-4">
                  <h3 className="font-semibold mb-3">🏆 Top 10 Más Vendidos (Mes)</h3>
                  <div className="space-y-2">
                    {topVentasMes.map(([id, data], index) => (
                      <div key={id} className="flex items-center justify-between p-2 rounded" style={{ background: 'var(--bg3)' }}>
                        <div className="flex items-center gap-3">
                          <span className="text-xl font-bold" style={{ color: index < 3 ? 'var(--warn)' : 'var(--text2)' }}>
                            {index + 1}
                          </span>
                          <div>
                            <p className="font-medium text-sm">{data.nombre}</p>
                            <p className="text-xs" style={{ color: 'var(--text2)' }}>{data.cantidad} uds · {data.categoria}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-sm">{fmt(data.ventas)} CUP</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="card p-4">
                  <h3 className="font-semibold mb-3">💰 Top 10 Mayor Ganancia (Mes)</h3>
                  <div className="space-y-2">
                    {topGananciaMes.map(([id, data], index) => (
                      <div key={id} className="flex items-center justify-between p-2 rounded" style={{ background: 'var(--bg3)' }}>
                        <div className="flex items-center gap-3">
                          <span className="text-xl font-bold" style={{ color: index < 3 ? 'var(--warn)' : 'var(--text2)' }}>
                            {index + 1}
                          </span>
                          <div>
                            <p className="font-medium text-sm">{data.nombre}</p>
                            <p className="text-xs" style={{ color: 'var(--text2)' }}>{data.cantidad} uds · {data.categoria}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-sm" style={{ color: 'var(--ok)' }}>{fmt(data.ganancia)} CUP</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {/* Categorías y Clientes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {topCategorias.length > 0 && (
                <div className="card p-4">
                  <h3 className="font-semibold mb-3">📂 Categorías Más Rentables (Mes)</h3>
                  <div className="space-y-2">
                    {topCategorias.map(([cat, data], index) => (
                      <div key={cat} className="flex items-center justify-between p-2 rounded" style={{ background: 'var(--bg3)' }}>
                        <div className="flex items-center gap-3">
                          <span className="text-xl font-bold" style={{ color: index < 3 ? 'var(--warn)' : 'var(--text2)' }}>
                            {index + 1}
                          </span>
                          <div>
                            <p className="font-medium text-sm">{cat}</p>
                            <p className="text-xs" style={{ color: 'var(--text2)' }}>Ventas: {fmt(data.ventas)} CUP</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-sm" style={{ color: 'var(--ok)' }}>{fmt(data.ganancia)} CUP</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {topClientes.length > 0 && (
                <div className="card p-4">
                  <h3 className="font-semibold mb-3">👥 Clientes Más Frecuentes (Mes)</h3>
                  <div className="space-y-2">
                    {topClientes.map(([id, data], index) => (
                      <div key={id} className="flex items-center justify-between p-2 rounded" style={{ background: 'var(--bg3)' }}>
                        <div className="flex items-center gap-3">
                          <span className="text-xl font-bold" style={{ color: index < 3 ? 'var(--warn)' : 'var(--text2)' }}>
                            {index + 1}
                          </span>
                          <div>
                            <p className="font-medium text-sm">{data.nombre}</p>
                            <p className="text-xs" style={{ color: 'var(--text2)' }}>{data.compras} compras</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-sm">{fmt(data.total)} CUP</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        );
      })()}
    </div>
  );
}

// ============ EXPENSES ============
function Expenses({ cfg }: { cfg: Record<string, any> }) {
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [modal, setModal] = useState(false);
  const [editItem, setEditItem] = useState<Gasto | null>(null);
  const [form, setForm] = useState<Partial<Gasto>>({});
  const tasa = cfg.tasa || 350;
  const cats = ['Salarios', 'Alquiler', 'Electricidad', 'Internet', 'Combustible', 'Mantenimiento', 'Merma', 'Otros'];

  const load = useCallback(async () => { setGastos(await dbGetAll<Gasto>('gastos')); }, []);
  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditItem(null); setForm({ concepto: '', categoria: cats[0], fecha: Date.now(), nota: '', montoCUP: 0, montoUSD: 0 }); setModal(true); };
  const openEdit = (g: Gasto) => { setEditItem(g); setForm({ ...g }); setModal(true); };
  const handleMontoCUP = (val: number) => setForm(f => ({ ...f, montoCUP: val, montoUSD: toUSD(val, tasa) }));
  const handleMontoUSD = (val: number) => setForm(f => ({ ...f, montoUSD: val, montoCUP: toCUP(val, tasa) }));

  const save = async () => {
    if (!form.concepto?.trim()) { showToast('Concepto requerido', 'err'); return; }
    if ((form.montoCUP || 0) <= 0 && (form.montoUSD || 0) <= 0) { showToast('Monto > 0', 'err'); return; }
    if (editItem) { await dbPut('gastos', { ...editItem, ...form }); } else { await dbAdd('gastos', { ...form, creado: Date.now() } as Gasto); }
    showToast('Guardado', 'ok'); setModal(false); load();
  };

  const del = async (g: Gasto) => { if (!confirm(`¿Eliminar?`)) return; await dbDelete('gastos', g.id!); load(); };

  const now = new Date(); const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const gastosMes = gastos.filter(g => g.fecha >= monthStart);

  return (
    <div>
      <div className="grid-3 mb-4"><div className="kpi"><div className="kpi-label">Mes CUP</div><div className="kpi-value">{fmt(gastosMes.reduce((s, g) => s + g.montoCUP, 0))}</div></div><div className="kpi" style={{ borderLeftColor: 'var(--ok)' }}><div className="kpi-label">Mes USD</div><div className="kpi-value">{fmt(gastosMes.reduce((s, g) => s + g.montoUSD, 0))}</div></div><div className="kpi" style={{ borderLeftColor: 'var(--warn)' }}><div className="kpi-label">Total</div><div className="kpi-value">{fmt(gastos.reduce((s, g) => s + g.montoCUP, 0))}</div></div></div>
      <div className="flex justify-end mb-4"><button className="btn btn-primary" onClick={openNew}>+ Nuevo Gasto</button></div>
      <div className="card table-wrap"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Cat.</th><th>CUP</th><th>USD</th><th></th></tr></thead><tbody>{[...gastos].sort((a, b) => b.fecha - a.fecha).map(g => (<tr key={g.id}><td className="text-xs">{fmtDate(g.fecha)}</td><td>{g.concepto}</td><td>{g.categoria}</td><td>{fmt(g.montoCUP)}</td><td>{fmt(g.montoUSD)}</td><td><button className="btn btn-ghost btn-sm" onClick={() => openEdit(g)}>✏️</button> <button className="btn btn-ghost btn-sm" onClick={() => del(g)}>🗑️</button></td></tr>))}</tbody></table></div>
      <Modal open={modal} onClose={() => setModal(false)} title={editItem ? 'Editar' : 'Nuevo Gasto'}><div className="space-y-3"><div><label className="text-xs font-medium">Concepto *</label><input className="input" value={form.concepto || ''} onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))} /></div><div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-medium">Categoría</label><select className="input" value={form.categoria || ''} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>{cats.map(c => <option key={c}>{c}</option>)}</select></div><div><label className="text-xs font-medium">Fecha</label><input type="date" className="input" value={form.fecha ? new Date(form.fecha).toISOString().split('T')[0] : ''} onChange={e => setForm(f => ({ ...f, fecha: new Date(e.target.value).getTime() }))} /></div><div><label className="text-xs font-medium">Monto CUP</label><input type="number" className="input" value={numVal(form.montoCUP)} onChange={e => handleMontoCUP(e.target.value === '' ? 0 : +e.target.value)} /></div><div><label className="text-xs font-medium">Monto USD</label><input type="number" className="input" value={numVal(form.montoUSD)} onChange={e => handleMontoUSD(e.target.value === '' ? 0 : +e.target.value)} /></div></div></div><div className="flex gap-2 mt-4 justify-end"><button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={save}>Guardar</button></div></Modal>
    </div>
  );
}

// ============ BACKUP ============
function Backup({ cfg }: { cfg: Record<string, any> }) {
  const [importing, setImporting] = useState(false);

  const exportJSON = async () => {
    const data = { productos: await dbGetAll('productos'), lotes: await dbGetAll('lotes'), compras: await dbGetAll('compras'), ventas: await dbGetAll('ventas'), clientes: await dbGetAll('clientes'), gastos: await dbGetAll('gastos'), anulaciones: await dbGetAll('anulaciones'), config: await dbGetAll('config'), tasas: await dbGetAll('tasas'), cierres: await dbGetAll('cierres'), exportDate: Date.now() };
    const encrypted = await encryptData(JSON.stringify(data));
    const blob = new Blob([encrypted], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ferreteria_suarez_${new Date().toISOString().split('T')[0]}.json`; a.click();
    showToast('Respaldo exportado', 'ok');
  };

  const exportExcel = async () => {
    const wb = XLSX.utils.book_new();
    const productos = await dbGetAll<any>('productos');
    if (productos.length) { XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(productos.map(p => ({ ID: p.id, Código: p.codigo, Nombre: p.nombre, Categoría: p.categoria, 'Compra CUP': p.compraCUP, 'Compra USD': p.compraUSD, 'Venta CUP': p.ventaCUP, 'Venta USD': p.ventaUSD, 'PEP CUP': p.pep, 'PEP USD': p.pepUSD, Stock: p.stock, Mín: p.min, 'Inversión CUP': p.stock * p.pep, 'Inversión USD': toUSD(p.stock * p.pep, cfg.tasa || 350) }))), 'Productos'); }
    const ventas = await dbGetAll<any>('ventas');
    if (ventas.length) { XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ventas.map(v => ({ Número: v.num, Fecha: fmtDateTime(v.fecha), Cliente: v.clienteNombre, Estado: v.estado, 'Total CUP': v.totalCUP, 'Total USD': v.totalUSD }))), 'Ventas'); }
    const clientes = await dbGetAll<any>('clientes');
    if (clientes.length) { XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clientes.map(c => ({ Nombre: c.nombre, Teléfono: c.telefono, 'Saldo CUP': c.saldoCUP, 'Saldo USD': c.saldoUSD, Compras: c.compras }))), 'Clientes'); }
    const gastos = await dbGetAll<any>('gastos');
    if (gastos.length) { XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gastos.map(g => ({ Fecha: fmtDate(g.fecha), Concepto: g.concepto, Categoría: g.categoria, 'Monto CUP': g.montoCUP, 'Monto USD': g.montoUSD }))), 'Gastos'); }
    const cierres = await dbGetAll<any>('cierres');
    if (cierres.length) { XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cierres.map(c => ({ Semana: `${fmtDate(c.semanaInicio)} - ${fmtDate(c.semanaFin)}`, Ventas: c.ventasIds.length, 'Ganancia Bruta': c.gananciaBrutaCUP, Gastos: c.totalGastosCUP, 'Ganancia Neta': c.gananciaNetaCUP, Inversión: c.inversionInventarioCUP, Accionista1: c.accionista1, Accionista2: c.accionista2, Dependienta: c.dependienta }))), 'Cierres'); }
    XLSX.writeFile(wb, `ferreteria_suarez_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('Excel exportado', 'ok');
  };

  const importJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!confirm('¿Restaurar? Se reemplazarán TODOS los datos.')) return;
    setImporting(true);
    try { const text = await file.text(); let json: string; try { json = await decryptData(text); } catch { json = text; } const data = JSON.parse(json); for (const store of ['productos', 'lotes', 'compras', 'ventas', 'clientes', 'gastos', 'anulaciones', 'config', 'tasas', 'cierres']) { if (data[store]) { await dbClear(store); for (const item of data[store]) await dbPut(store, item); } } showToast('Restaurado', 'ok'); } catch (err) { showToast('Error: ' + (err as Error).message, 'err'); }
    setImporting(false); e.target.value = '';
  };

  const clearAll = async () => { if (!confirm('⚠️ ¿Borrar TODO?')) return; if (!confirm('¿Seguro?')) return; for (const s of ['productos', 'lotesCompra', 'compras', 'ventas', 'clientes', 'gastos', 'anulaciones', 'tasas', 'cierres', 'cierresDiarios', 'transferencias']) await dbClear(s); showToast('Eliminado', 'warn'); };

  return (
    <div className="space-y-6">
      <div className="card p-6"><h3 className="font-bold text-lg mb-4">📤 Exportar</h3><div className="flex flex-wrap gap-3"><button className="btn btn-primary" onClick={exportJSON}>📦 JSON Cifrado</button><button className="btn btn-ok" onClick={exportExcel}>📊 Excel Completo</button></div></div>
      <div className="card p-6"><h3 className="font-bold text-lg mb-4">📥 Importar</h3><label className="btn btn-info cursor-pointer">📦 Restaurar JSON {importing && '...'}<input type="file" accept=".json" className="hidden" onChange={importJSON} disabled={importing} /></label></div>
      <div className="card p-6" style={{ borderColor: 'var(--err)' }}><h3 className="font-bold text-lg mb-4" style={{ color: 'var(--err)' }}>⚠️ Zona Peligrosa</h3><button className="btn btn-err" onClick={clearAll}>🗑️ Borrar Todo</button></div>
    </div>
  );
}

// ============ SETTINGS ============
function Settings({ cfg, refreshCfg }: { cfg: Record<string, any>; refreshCfg: () => void }) {
  const [tasa, setTasa] = useState(cfg.tasa || 350);
  const [biz, setBiz] = useState(cfg.biz || 'Ferretería Suárez');
  const [addr, setAddr] = useState(cfg.addr || '');
  const [phone, setPhone] = useState(cfg.phone || '');
  const [nit, setNit] = useState(cfg.nit || '');
  const [tema, setTema] = useState(cfg.tema || 'auto');
  const [size, setSize] = useState(cfg.size || 'md');
  const [units, setUnits] = useState<string[]>(cfg.unidades || []);
  const [cats, setCats] = useState<string[]>(cfg.categorias || []);
  const [newUnit, setNewUnit] = useState('');
  const [newCat, setNewCat] = useState('');
  const [pctDep, setPctDep] = useState(cfg.pctDependienta || 0);
  const [acc1Name, setAcc1Name] = useState(cfg.accionista1Nombre || 'Accionista 1');
  const [acc2Name, setAcc2Name] = useState(cfg.accionista2Nombre || 'Accionista 2');
  const [depName, setDepName] = useState(cfg.dependientaNombre || 'Dependienta');
  const [actualizarPrecios, setActualizarPrecios] = useState(cfg.actualizarPreciosConTasa || false);
  const [mostrarEquiv, setMostrarEquiv] = useState(cfg.mostrarEquivalentes !== false);
  const [showTasas, setShowTasas] = useState(false);
  const [tasas, setTasas] = useState<Tasa[]>([]);
  
  // Visibilidad de métricas
  const [mostrarCajaCUP, setMostrarCajaCUP] = useState(cfg.mostrarCajaCUP !== false);
  const [mostrarCajaUSD, setMostrarCajaUSD] = useState(cfg.mostrarCajaUSD !== false);
  const [mostrarGanancia, setMostrarGanancia] = useState(cfg.mostrarGanancia !== false);
  const [mostrarInversion, setMostrarInversion] = useState(cfg.mostrarInversion !== false);
  const [mostrarInventarioPorUbicacion, setMostrarInventarioPorUbicacion] = useState(cfg.mostrarInventarioPorUbicacion !== false);
  const [mostrarDesglosePagos, setMostrarDesglosePagos] = useState(cfg.mostrarDesglosePagos !== false);
  const [mostrarCierreDia, setMostrarCierreDia] = useState(cfg.mostrarCierreDia !== false);
  const [mostrarDistribucionGanancias, setMostrarDistribucionGanancias] = useState(cfg.mostrarDistribucionGanancias !== false);

  useEffect(() => { (async () => { setTasas(await dbGetAll<Tasa>('tasas')); })(); }, []);

  const saveTasa = async () => {
    const ant = cfg.tasa || 350;
    await setConfig('tasa', tasa);
    await dbAdd('tasas', { fecha: Date.now(), anterior: ant, nueva: tasa });
    
    // Si está activado, actualizar precios CUP de productos no fijos
    if (actualizarPrecios && ant !== tasa) {
      const productos = await dbGetAll<Producto>('productos');
      for (const p of productos) {
        if (!p.precioFijoCUP && p.ventaUSD > 0) {
          await dbPut('productos', { ...p, ventaCUP: toCUP(p.ventaUSD, tasa) });
        }
      }
      showToast('Precios actualizados según nueva tasa', 'ok');
    }
    
    setTasas(await dbGetAll<Tasa>('tasas'));
    await refreshCfg();
    showToast(`Tasa: ${ant} → ${tasa}`, 'ok');
  };

  const saveBiz = async () => { await setConfig('biz', biz); await setConfig('addr', addr); await setConfig('phone', phone); await setConfig('nit', nit); await refreshCfg(); showToast('Guardado', 'ok'); };
  const saveDep = async () => { await setConfig('pctDependienta', pctDep); await setConfig('accionista1Nombre', acc1Name); await setConfig('accionista2Nombre', acc2Name); await setConfig('dependientaNombre', depName); await refreshCfg(); showToast('Guardado', 'ok'); };
  const saveOptions = async () => { await setConfig('actualizarPreciosConTasa', actualizarPrecios); await setConfig('mostrarEquivalentes', mostrarEquiv); await refreshCfg(); showToast('Guardado', 'ok'); };
  const saveVisibility = async () => {
    await setConfig('mostrarCajaCUP', mostrarCajaCUP);
    await setConfig('mostrarCajaUSD', mostrarCajaUSD);
    await setConfig('mostrarGanancia', mostrarGanancia);
    await setConfig('mostrarInversion', mostrarInversion);
    await setConfig('mostrarInventarioPorUbicacion', mostrarInventarioPorUbicacion);
    await setConfig('mostrarDesglosePagos', mostrarDesglosePagos);
    await setConfig('mostrarCierreDia', mostrarCierreDia);
    await setConfig('mostrarDistribucionGanancias', mostrarDistribucionGanancias);
    await refreshCfg();
    showToast('Visibilidad guardada', 'ok');
  };

  const lic = getLicense();

  return (
    <div className="space-y-6">
      <div className="card p-6"><h3 className="font-bold text-lg mb-4">💱 Tasa de Cambio</h3><div className="flex gap-3 items-end"><div className="flex-1"><label className="text-xs font-medium">1 USD = ? CUP</label><input type="number" className="input" value={numVal(tasa)} onChange={e => setTasa(e.target.value === '' ? 0 : +e.target.value)} /></div><button className="btn btn-primary" onClick={saveTasa}>Guardar</button><button className="btn btn-ghost" onClick={() => setShowTasas(true)}>📋 Historial</button></div></div>

      <div className="card p-6"><h3 className="font-bold text-lg mb-4">👥 Accionistas y Dependienta</h3><div className="space-y-3">
        <div><label className="text-xs font-medium">Nombre Accionista 1</label><input className="input" value={acc1Name} onChange={e => setAcc1Name(e.target.value)} /></div>
        <div><label className="text-xs font-medium">Nombre Accionista 2</label><input className="input" value={acc2Name} onChange={e => setAcc2Name(e.target.value)} /></div>
        <div><label className="text-xs font-medium">Nombre Dependienta</label><input className="input" value={depName} onChange={e => setDepName(e.target.value)} /></div>
        <div><label className="text-xs font-medium">% Dependienta (del Accionista 2)</label><input type="number" className="input" value={numVal(pctDep)} onChange={e => setPctDep(e.target.value === '' ? 0 : Math.min(100, Math.max(0, +e.target.value)))} min={0} max={100} /></div>
        <button className="btn btn-primary" onClick={saveDep}>Guardar</button>
      </div></div>

      <div className="card p-6"><h3 className="font-bold text-lg mb-4">⚙️ Opciones de Comportamiento</h3><div className="space-y-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={actualizarPrecios} onChange={e => setActualizarPrecios(e.target.checked)} /> Al cambiar la tasa, actualizar automáticamente precios CUP (excepto productos con precio fijo)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mostrarEquiv} onChange={e => setMostrarEquiv(e.target.checked)} /> Mostrar equivalentes en la otra moneda</label>
        <button className="btn btn-primary" onClick={saveOptions}>Guardar</button>
      </div></div>

      <div className="card p-6"><h3 className="font-bold text-lg mb-4">👁️ Visibilidad de Métricas</h3><p className="text-xs mb-3" style={{ color: 'var(--text2)' }}>Controla qué métricas se muestran en Dashboard, Ventas, Cierre Semanal y Métricas</p><div className="space-y-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mostrarCajaCUP} onChange={e => setMostrarCajaCUP(e.target.checked)} /> 💵 Caja CUP</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mostrarCajaUSD} onChange={e => setMostrarCajaUSD(e.target.checked)} /> 💵 Caja USD</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mostrarGanancia} onChange={e => setMostrarGanancia(e.target.checked)} /> 💰 Ganancia</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mostrarInversion} onChange={e => setMostrarInversion(e.target.checked)} /> 💸 Inversión / Costo</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mostrarInventarioPorUbicacion} onChange={e => setMostrarInventarioPorUbicacion(e.target.checked)} /> 📦 Inventario por Ubicación (Tienda/Almacén)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mostrarDesglosePagos} onChange={e => setMostrarDesglosePagos(e.target.checked)} /> 💳 Desglose de Pagos (Efectivo/Transferencia/Crédito)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mostrarCierreDia} onChange={e => setMostrarCierreDia(e.target.checked)} /> 📊 Cierre del Día</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mostrarDistribucionGanancias} onChange={e => setMostrarDistribucionGanancias(e.target.checked)} /> 📈 Distribución de Ganancias (Accionistas/Dependienta)</label>
        <button className="btn btn-primary" onClick={saveVisibility}>Guardar</button>
      </div></div>

      <div className="card p-6"><h3 className="font-bold text-lg mb-4">🏪 Negocio</h3><div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-medium">Nombre</label><input className="input" value={biz} onChange={e => setBiz(e.target.value)} /></div><div><label className="text-xs font-medium">Dirección</label><input className="input" value={addr} onChange={e => setAddr(e.target.value)} /></div><div><label className="text-xs font-medium">Teléfono</label><input className="input" value={phone} onChange={e => setPhone(e.target.value)} /></div><div><label className="text-xs font-medium">NIT</label><input className="input" value={nit} onChange={e => setNit(e.target.value)} /></div></div><button className="btn btn-primary mt-3" onClick={saveBiz}>Guardar</button></div>

      <div className="card p-6"><h3 className="font-bold text-lg mb-4">🎨 Apariencia</h3><div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-medium">Tema</label><select className="input" value={tema} onChange={e => { setTema(e.target.value); setConfig('tema', e.target.value); refreshCfg(); }}><option value="light">Claro</option><option value="dark">Oscuro</option><option value="auto">Auto</option></select></div><div><label className="text-xs font-medium">Tamaño</label><select className="input" value={size} onChange={e => { setSize(e.target.value); setConfig('size', e.target.value); refreshCfg(); }}><option value="sm">Compacto</option><option value="md">Normal</option><option value="lg">Grande</option></select></div></div></div>

      <div className="card p-6"><h3 className="font-bold text-lg mb-4">📏 Unidades</h3><div className="flex flex-wrap gap-2 mb-3">{units.map(u => <span key={u} className="badge badge-info flex items-center gap-1">{u} <button onClick={async () => { const upd = units.filter(x => x !== u); await setConfig('unidades', upd); setUnits(upd); refreshCfg(); }} className="text-red-500">✕</button></span>)}</div><div className="flex gap-2"><input className="input max-w-[200px]" placeholder="Nueva..." value={newUnit} onChange={e => setNewUnit(e.target.value)} /><button className="btn btn-primary btn-sm" onClick={async () => { if (!newUnit.trim()) return; const upd = [...units, newUnit.trim()]; await setConfig('unidades', upd); setUnits(upd); setNewUnit(''); refreshCfg(); }}>Agregar</button></div></div>

      <div className="card p-6"><h3 className="font-bold text-lg mb-4">📁 Categorías</h3><div className="flex flex-wrap gap-2 mb-3">{cats.map(c => <span key={c} className="badge badge-ok flex items-center gap-1">{c} <button onClick={async () => { const upd = cats.filter(x => x !== c); await setConfig('categorias', upd); setCats(upd); refreshCfg(); }} className="text-red-500">✕</button></span>)}</div><div className="flex gap-2"><input className="input max-w-[200px]" placeholder="Nueva..." value={newCat} onChange={e => setNewCat(e.target.value)} /><button className="btn btn-primary btn-sm" onClick={async () => { if (!newCat.trim()) return; const upd = [...cats, newCat.trim()]; await setConfig('categorias', upd); setCats(upd); setNewCat(''); refreshCfg(); }}>Agregar</button></div></div>

      <div className="card p-6"><h3 className="font-bold text-lg mb-4">🔑 Licencia</h3>{lic ? (<div className="space-y-2"><p>Plan: {lic.plan}</p><p>Estado: {isLicenseValid() ? <span className="badge badge-ok">Activa</span> : <span className="badge badge-err">Expirada</span>}</p>{lic.days > 0 && <p>Expira: {fmtDate(lic.expires)}</p>}<button className="btn btn-err btn-sm mt-2" onClick={() => { clearLicense(); window.location.reload(); }}>Cerrar Licencia</button></div>) : <p>Sin licencia</p>}</div>

      <Modal open={showTasas} onClose={() => setShowTasas(false)} title="Historial de Tasas"><table><thead><tr><th>Fecha</th><th>Anterior</th><th>Nueva</th></tr></thead><tbody>{[...tasas].sort((a, b) => b.fecha - a.fecha).map(t => (<tr key={t.id}><td>{fmtDateTime(t.fecha)}</td><td>{fmt(t.anterior)}</td><td>{fmt(t.nueva)}</td></tr>))}</tbody></table></Modal>
    </div>
  );
}
