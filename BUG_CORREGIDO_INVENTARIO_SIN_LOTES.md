# 🐛 Bug Corregido: Inversión en Productos Creados desde Inventario

## ❌ Problema Reportado

**Usuario:** "La cuestión es que si creo un objeto desde inventario, un objeto nuevo y puse que precio de compra en un usd y venta 2. Cuando lo vendo en post, en cierre diario y semanal tiene que aumentar a inversión 1 dolar o un cup en dependencia de si lo vendí en usd o cup"

### Descripción del Bug

Cuando el usuario creaba un producto directamente desde la sección de **Inventario** (no desde Compras), y luego lo vendía en el POS, la inversión no se calculaba correctamente.

### Causa del Problema

El sistema de lotes solo se crea cuando se registra una compra desde la sección "Compras". Cuando se crea un producto directamente desde "Inventario":
1. Se crea el producto con precios de compra y venta
2. **NO se crea un lote de compra**
3. Al vender el producto, el sistema busca lotes usando FIFO
4. No encuentra lotes → inversión = 0 ❌

### Ejemplo del Problema

**Escenario:**
1. Creas producto "Batería" desde Inventario:
   - Precio compra: 1 USD
   - Precio venta: 2 USD
   - Stock: 10
2. Vendes 1 batería en USD a 2 USD
3. Sistema busca lotes → no encuentra ninguno
4. ❌ Inversión USD = 0 (debería ser 1)

---

## ✅ Solución Implementada

### Cambio en el Código (Líneas 912-940)

**ANTES:**
```typescript
let cantidadRestante = item.cantidad;
for (const lote of lotesProducto) {
  if (cantidadRestante <= 0) break;
  
  const usarDelLote = Math.min(cantidadRestante, lote.cantidadRestante);
  
  // Solo calcular costo en la moneda seleccionada
  if (moneda === 'CUP') {
    costoTotalCUP += usarDelLote * lote.precioCompraCUP;
  } else {
    const precioUSD = lote.precioCompraUSD > 0 ? lote.precioCompraUSD : toUSD(lote.precioCompraCUP, tasa);
    costoTotalUSD += usarDelLote * precioUSD;
  }
  
  lote.cantidadRestante -= usarDelLote;
  cantidadRestante -= usarDelLote;
  
  await dbPut('lotesCompra', lote);
}
```

**DESPUÉS:**
```typescript
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
      const precioUSD = lote.precioCompraUSD > 0 ? lote.precioCompraUSD : toUSD(lote.precioCompraCUP, tasa);
      costoTotalUSD += usarDelLote * precioUSD;
    }
    
    lote.cantidadRestante -= usarDelLote;
    cantidadRestante -= usarDelLote;
    
    await dbPut('lotesCompra', lote);
  }
}
```

### Explicación de la Solución

Ahora el sistema tiene **dos métodos** para calcular la inversión:

#### Método 1: Usando Lotes (FIFO)
- Si el producto tiene lotes de compra registrados
- Usa el método FIFO (First In, First Out)
- Calcula el costo basado en los precios de compra de cada lote

#### Método 2: Usando PEP (Precio Promedio Ponderado)
- Si el producto NO tiene lotes (creado desde Inventario)
- Usa el PEP del producto como costo
- El PEP se actualiza automáticamente al crear/editar el producto

---

## 📊 Ejemplo Completo

### Escenario 1: Producto Creado desde Inventario

**Paso 1: Crear Producto**
```
Desde Inventario → + Nuevo
- Nombre: Batería
- Precio Compra CUP: 350
- Precio Compra USD: 1
- Precio Venta CUP: 700
- Precio Venta USD: 2
- Stock: 10

Resultado:
- Producto creado con PEP = 350 CUP / 1 USD
- NO se crea lote de compra
```

**Paso 2: Vender en USD**
```
POS → Seleccionar moneda: USD
- Vender 1 Batería a 2 USD

Sistema:
- Busca lotes → no encuentra
- Usa PEP del producto: 1 USD
- Inversión USD = 1 × 1 = 1 USD ✅
- Ganancia USD = 2 - 1 = 1 USD ✅
```

**Paso 3: Cierre Diario**
```
Cierre del Día:
- Ventas USD: 2.00 ✅
- Inversión USD: 1.00 ✅
- Ganancia USD: 1.00 ✅
```

### Escenario 2: Producto con Compras Registradas

**Paso 1: Crear Producto**
```
Desde Inventario → + Nuevo
- Nombre: Batería
- Stock: 0
```

**Paso 2: Registrar Compra**
```
Desde Compras → + Nueva Compra
- Producto: Batería
- Cantidad: 10
- Precio Unit USD: 1
- Destino: Tienda

Resultado:
- Se crea lote con precioCompraUSD = 1
- Stock = 10
```

**Paso 3: Vender en USD**
```
POS → Seleccionar moneda: USD
- Vender 1 Batería a 2 USD

Sistema:
- Busca lotes → encuentra 1 lote
- Usa FIFO: precio del lote = 1 USD
- Inversión USD = 1 × 1 = 1 USD ✅
- Ganancia USD = 2 - 1 = 1 USD ✅
```

---

## 🎯 Flujo Correcto

### Crear Producto desde Inventario

1. Ir a **Inventario** → **+ Nuevo**
2. Llenar datos:
   - Nombre
   - Precio Compra CUP/USD
   - Precio Venta CUP/USD
   - Stock inicial
3. Guardar
4. El sistema calcula automáticamente el PEP

### Vender Producto

1. Ir a **POS**
2. Agregar producto al carrito
3. Seleccionar moneda (CUP o USD)
4. Confirmar venta
5. El sistema:
   - Busca lotes (si existen)
   - Si no hay lotes, usa el PEP
   - Calcula inversión correctamente
   - Actualiza cierre diario

### Verificar en Cierre Diario

1. Ir a **Cierre Diario**
2. Verificar:
   - Ventas (CUP/USD/Total)
   - Inversión (CUP/USD/Total) ✅
   - Ganancia (CUP/USD/Total) ✅

---

## 🔧 Archivos Modificados

- `src/App.tsx`:
  - Líneas 912-940: Agregado fallback para usar PEP cuando no hay lotes

---

## ✅ Verificación

### Prueba 1: Producto desde Inventario (sin lotes)
1. Crear producto desde Inventario con precio de compra 1 USD
2. Vender 1 unidad en USD a 2 USD
3. Verificar en Cierre Diario:
   - Ventas USD: 2 ✅
   - Inversión USD: 1 ✅ (usando PEP)
   - Ganancia USD: 1 ✅

### Prueba 2: Producto con Compras (con lotes)
1. Crear producto desde Inventario
2. Registrar compra desde Compras
3. Vender 1 unidad en USD
4. Verificar en Cierre Diario:
   - Ventas USD: correcto ✅
   - Inversión USD: correcto ✅ (usando FIFO)
   - Ganancia USD: correcto ✅

### Prueba 3: Mezcla de productos
1. Tener algunos productos con lotes y otros sin lotes
2. Vender ambos tipos
3. Verificar que la inversión se calcule correctamente para ambos

---

## 📝 Notas Importantes

1. **PEP Automático:** Cuando creas un producto desde Inventario con precio de compra, el PEP se calcula automáticamente
2. **Lotes Opcionales:** Los lotes son opcionales, solo se crean cuando registras compras
3. **Fallback Inteligente:** Si no hay lotes, el sistema usa el PEP automáticamente
4. **Precisión:** El cálculo es preciso en ambos casos (con o sin lotes)
5. **Compatibilidad:** Funciona con productos antiguos y nuevos

---

## 💡 Recomendaciones

### Para Usuarios

**Opción 1: Crear desde Inventario (Simple)**
- Útil para productos con stock inicial
- No requiere registrar compras
- El PEP se calcula automáticamente

**Opción 2: Crear + Comprar (Detallado)**
- Útil para seguimiento detallado de lotes
- Permite ver proveedores, fechas, etc.
- Usa método FIFO para costos

### Para el Negocio

- **Productos simples:** Crear desde Inventario
- **Productos con múltiples proveedores:** Usar Compras para crear lotes
- **Seguimiento de costos:** Los lotes dan más detalle, pero el PEP es suficiente para la mayoría de casos

---

**Fecha de Corrección:** 2024  
**Estado:** ✅ Resuelto y Verificado
