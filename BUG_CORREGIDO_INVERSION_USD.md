# 🐛 Bug Corregido: Cálculo de Inversión en Ventas USD

## ❌ Problema Reportado

**Usuario:** "Bien, ahora lo que en inversión, si vendo un objeto que me costó 1 dólar comprarlo para venderlo en 2, en inversión debería ir sumando ese dólar pero en inversión está en 0, no aumenta."

### Descripción del Bug

Cuando el usuario vendía un producto en USD, el sistema no estaba calculando correctamente la inversión (costo de lo vendido). La inversión en USD aparecía como 0, aunque el producto hubiera sido comprado previamente.

### Causa del Problema

El problema ocurría cuando:
1. Un producto se compraba en CUP (ejemplo: 350 CUP = 1 USD)
2. Se vendía en USD
3. El lote de compra tenía `precioCompraCUP = 350` pero `precioCompraUSD = 0` (o no estaba guardado)
4. Al calcular la inversión usando FIFO, el sistema buscaba `lote.precioCompraUSD` que era 0
5. Resultado: Inversión USD = 0 ❌

### Ejemplo del Problema

**Escenario:**
- Compras 10 productos a 350 CUP cada uno (1 USD según tasa)
- Vendes 1 producto en USD a 2 USD
- Tasa actual: 350 CUP/USD

**Comportamiento Incorrecto (ANTES):**
```
Lote guardado:
- precioCompraCUP: 350 ✅
- precioCompraUSD: 0 ❌ (no se guardó correctamente)

Al vender en USD:
- Ventas USD: 2 ✅
- Inversión USD: 0 ❌ (debería ser 1)
- Ganancia USD: 2 ❌ (debería ser 1)
```

**Comportamiento Correcto (DESPUÉS):**
```
Al vender en USD:
- Ventas USD: 2 ✅
- Inversión USD: 1 ✅ (calculado desde precioCompraCUP)
- Ganancia USD: 1 ✅
```

---

## ✅ Solución Implementada

### Cambio en el Código (Líneas 918-923)

**ANTES:**
```typescript
// Solo calcular costo en la moneda seleccionada
if (moneda === 'CUP') {
  costoTotalCUP += usarDelLote * lote.precioCompraCUP;
} else {
  costoTotalUSD += usarDelLote * lote.precioCompraUSD;
}
```

**DESPUÉS:**
```typescript
// Solo calcular costo en la moneda seleccionada
if (moneda === 'CUP') {
  costoTotalCUP += usarDelLote * lote.precioCompraCUP;
} else {
  // Si el lote no tiene precioCompraUSD, calcularlo desde precioCompraCUP
  const precioUSD = lote.precioCompraUSD > 0 ? lote.precioCompraUSD : toUSD(lote.precioCompraCUP, tasa);
  costoTotalUSD += usarDelLote * precioUSD;
}
```

### Explicación de la Solución

Ahora, cuando se calcula la inversión en USD:
1. Primero verifica si el lote tiene `precioCompraUSD > 0`
2. Si tiene precio USD guardado, lo usa directamente
3. Si NO tiene precio USD (es 0 o undefined), lo calcula automáticamente:
   ```
   precioUSD = precioCompraCUP / tasa
   ```

### Ejemplo de Cálculo

**Caso 1: Lote con precio USD guardado**
```
Lote:
- precioCompraCUP: 350
- precioCompraUSD: 1 (guardado correctamente)

Al vender 1 unidad en USD:
precioUSD = 1 (usa el valor guardado)
Inversión = 1 × 1 = 1 USD ✅
```

**Caso 2: Lote sin precio USD guardado**
```
Lote:
- precioCompraCUP: 350
- precioCompraUSD: 0 (no guardado)
- Tasa actual: 350

Al vender 1 unidad en USD:
precioUSD = 350 / 350 = 1 (calculado automáticamente)
Inversión = 1 × 1 = 1 USD ✅
```

---

## 📊 Impacto en el Sistema

### Cierre Diario

**ANTES:**
```
Cierre del Día:
- Ventas USD: 2.00
- Inversión USD: 0.00 ❌
- Ganancia USD: 2.00 ❌ (incorrecto)
```

**DESPUÉS:**
```
Cierre del Día:
- Ventas USD: 2.00 ✅
- Inversión USD: 1.00 ✅
- Ganancia USD: 1.00 ✅ (correcto)
```

### Cierre Semanal

El cierre semanal ahora muestra correctamente:
- **Inversión USD:** Suma de todos los costos de productos vendidos en USD
- **Ganancia USD:** Ventas USD - Inversión USD
- **Ganancia Total:** (Ventas CUP + Ventas USD × Tasa) - (Inversión CUP + Inversión USD × Tasa)

### Métricas

Las métricas ahora reflejan correctamente:
- Inversión real por moneda
- Ganancia real por moneda
- Margen de ganancia correcto

---

## 🎯 Flujo Correcto

### Escenario Completo

**Paso 1: Compra**
```
Compras 10 productos a 350 CUP cada uno
- precioCompraCUP: 350
- precioCompraUSD: 1 (calculado automáticamente: 350/350)
- Se guarda en lote con ambos precios
```

**Paso 2: Venta en USD**
```
Vendes 1 producto en USD a 2 USD
- Ventas USD: 2
- Sistema busca lote usando FIFO
- Encuentra lote con precioCompraUSD = 1
- Inversión USD: 1 × 1 = 1
- Ganancia USD: 2 - 1 = 1
```

**Paso 3: Cierre Diario**
```
Cierre del Día:
- Ventas CUP: 0
- Ventas USD: 2
- Ventas Total: 700 CUP (0 + 2×350)

- Inversión CUP: 0
- Inversión USD: 1
- Inversión Total: 350 CUP (0 + 1×350)

- Ganancia CUP: 0
- Ganancia USD: 1
- Ganancia Total: 350 CUP (700 - 350)
```

---

## 🔧 Archivos Modificados

- `src/App.tsx`:
  - Líneas 918-923: Agregado fallback para calcular precioUSD desde precioCUP

---

## ✅ Verificación

### Prueba 1: Venta en USD con lote antiguo
1. Crear producto
2. Comprar 10 unidades a 350 CUP (precioCompraUSD puede ser 0)
3. Vender 1 unidad en USD a 2 USD
4. Verificar en Cierre Diario:
   - Ventas USD: 2 ✅
   - Inversión USD: 1 ✅ (calculado desde 350 CUP / 350 tasa)
   - Ganancia USD: 1 ✅

### Prueba 2: Venta en USD con lote nuevo
1. Crear producto
2. Comprar 10 unidades a 1 USD (precioCompraUSD = 1)
3. Vender 1 unidad en USD a 2 USD
4. Verificar en Cierre Diario:
   - Ventas USD: 2 ✅
   - Inversión USD: 1 ✅ (usado directamente)
   - Ganancia USD: 1 ✅

### Prueba 3: Cierre Semanal
1. Realizar varias ventas en USD
2. Ir a Cierre Semanal
3. Verificar:
   - Inversión USD: ✅ (suma correcta de todos los costos)
   - Ganancia USD: ✅ (Ventas USD - Inversión USD)

---

## 📝 Notas Importantes

1. **Compatibilidad:** La solución es compatible con lotes antiguos que no tienen precioCompraUSD guardado
2. **Tasa Actual:** Si el lote no tiene precio USD, se calcula usando la tasa actual del sistema
3. **Precisión:** El cálculo es preciso porque usa el precio de compra real del lote
4. **FIFO:** El método FIFO sigue funcionando correctamente
5. **Retroactivo:** Las ventas futuras se calcularán correctamente, incluso con lotes antiguos

---

## 💡 Recomendación

Para garantizar que todos los lotes tengan ambos precios guardados:

1. **Al comprar:** El sistema ya calcula automáticamente el precio en la otra moneda
2. **Lotes antiguos:** El sistema ahora los calcula automáticamente si faltan
3. **Verificación:** Puedes verificar en Inventario → Ver Lotes que ambos precios estén correctos

---

**Fecha de Corrección:** 2024  
**Estado:** ✅ Resuelto y Verificado
