# 📊 Nueva Estructura de Cierres

## ✅ Cierre Semanal y Diario Reconstruidos desde Cero

He reconstruido completamente las secciones de **Cierre Semanal** y **Cierre Diario** con una estructura clara y lógica que sigue el flujo de negocio real.

---

## 🎯 Estructura de Cálculos

### 1️⃣ VENTAS
```
Ventas CUP = Suma de todas las ventas en CUP
Ventas USD = Suma de todas las ventas en USD
Ventas Total = Ventas CUP + (Ventas USD × Tasa)
```

**Ejemplo:**
- Ventas CUP: 5,000
- Ventas USD: 10
- Tasa: 350
- **Ventas Total = 5,000 + (10 × 350) = 8,500 CUP**

---

### 2️⃣ INVERSIÓN (Costo de lo vendido)
```
Inversión CUP = Suma del costo de productos vendidos en CUP
Inversión USD = Suma del costo de productos vendidos en USD
Inversión Total = Inversión CUP + (Inversión USD × Tasa)
```

**Ejemplo:**
- Vendiste 2 productos:
  - Producto A: Vendido a 500 CUP, Costo 300 CUP
  - Producto B: Vendido a 2 USD, Costo 1 USD
- **Inversión CUP = 300**
- **Inversión USD = 1**
- **Inversión Total = 300 + (1 × 350) = 650 CUP**

---

### 3️⃣ GANANCIA
```
Ganancia CUP = Ventas CUP - Inversión CUP
Ganancia USD = Ventas USD - Inversión USD
Ganancia Total = Ventas Total - Inversión Total
```

**Ejemplo:**
- **Ganancia CUP = 5,000 - 300 = 4,700 CUP**
- **Ganancia USD = 10 - 1 = 9 USD**
- **Ganancia Total = 8,500 - 650 = 7,850 CUP**

---

### 4️⃣ GASTOS
```
Gastos = Suma de todos los gastos del período
```

**Ejemplo:**
- Electricidad: 200 CUP
- Internet: 100 CUP
- **Gastos Total = 300 CUP**

---

### 5️⃣ GANANCIA NETA
```
Ganancia Neta = Ganancia Total - Gastos
```

**Ejemplo:**
- **Ganancia Neta = 7,850 - 300 = 7,550 CUP**

---

### 6️⃣ DISTRIBUCIÓN (de la Ganancia Neta)
```
Accionista 1 = Ganancia Neta × 50%
Accionista 2 = Ganancia Neta × 50%
Dependienta = Accionista 2 × (% configurado / 100)
Accionista 2 Neto = Accionista 2 - Dependienta
```

**Ejemplo (con 10% para dependienta):**
- **Accionista 1 = 7,550 × 50% = 3,775 CUP**
- **Accionista 2 = 7,550 × 50% = 3,775 CUP**
- **Dependienta = 3,775 × 10% = 377.5 CUP**
- **Accionista 2 Neto = 3,775 - 377.5 = 3,397.5 CUP**

---

### 7️⃣ CAJA
```
Caja CUP = Efectivo CUP + Transferencia CUP
Caja USD = Efectivo USD + Transferencia USD
```

**Ejemplo:**
- Efectivo CUP: 3,000
- Transferencia CUP: 2,000
- Efectivo USD: 5
- Transferencia USD: 3
- **Caja CUP = 5,000**
- **Caja USD = 8**

---

## 📋 Visualización en Pantalla

### Cierre Semanal
```
┌─────────────────────────────────────────────────────────────┐
│ 📅 Semana: 01/01/2024 - 06/01/2024                         │
│ 15 ventas realizadas                                       │
├─────────────────────────────────────────────────────────────┤
│ 💵 Ventas CUP      │ 💵 Ventas USD      │ 📊 Ventas Total   │
│ 5,000.00           │ 10.00              │ 8,500.00          │
│                    │                    │ ≈ 24.29 USD       │
├─────────────────────────────────────────────────────────────┤
│ 🔄 Inversión CUP   │ 🔄 Inversión USD   │ 🔄 Inversión Total│
│ 300.00             │ 1.00               │ 650.00            │
│                    │                    │ ≈ 1.86 USD        │
├─────────────────────────────────────────────────────────────┤
│ 💰 Ganancia CUP    │ 💰 Ganancia USD    │ 💰 Ganancia Total │
│ 4,700.00           │ 9.00               │ 7,850.00          │
│                    │                    │ ≈ 22.43 USD       │
├─────────────────────────────────────────────────────────────┤
│ 💸 Gastos          │ 💰 Ganancia Neta   │                   │
│ 300.00             │ 7,550.00           │                   │
│                    │ ≈ 21.57 USD        │                   │
├─────────────────────────────────────────────────────────────┤
│ 💵 Caja CUP        │ 💵 Caja USD                             │
│ 5,000.00           │ 8.00                                    │
├─────────────────────────────────────────────────────────────┤
│ 📊 Distribución de Ganancia Neta                             │
├─────────────────────────────────────────────────────────────┤
│ 👤 Accionista 1    │ 👤 Accionista 2    │ 💁 Dependienta    │
│ (50%)              │ - NETO             │ (10% del Acc. 2)  │
│ 3,775.00 CUP       │ 3,397.50 CUP       │ 377.50 CUP        │
│ ≈ 10.79 USD        │ ≈ 9.71 USD         │ ≈ 1.08 USD        │
└─────────────────────────────────────────────────────────────┘
```

### Cierre Diario
```
┌─────────────────────────────────────────────────────────────┐
│ 📆 Cierre del Día                                          │
│ 01/01/2024 - 5 ventas realizadas                           │
├─────────────────────────────────────────────────────────────┤
│ 💵 Ventas CUP      │ 💵 Ventas USD      │ 📊 Ventas Total   │
│ 1,000.00           │ 2.00               │ 1,700.00          │
│                    │                    │ ≈ 4.86 USD        │
├─────────────────────────────────────────────────────────────┤
│ 🔄 Inversión CUP   │ 🔄 Inversión USD   │ 🔄 Inversión Total│
│ 60.00              │ 0.20               │ 130.00            │
│                    │                    │ ≈ 0.37 USD        │
├─────────────────────────────────────────────────────────────┤
│ 💰 Ganancia CUP    │ 💰 Ganancia USD    │ 💰 Ganancia Total │
│ 940.00             │ 1.80               │ 1,570.00          │
│                    │                    │ ≈ 4.49 USD        │
├─────────────────────────────────────────────────────────────┤
│ 💸 Gastos          │ 💰 Ganancia Neta   │                   │
│ 50.00              │ 1,520.00           │                   │
│                    │ ≈ 4.34 USD         │                   │
├─────────────────────────────────────────────────────────────┤
│ 💵 Caja CUP        │ 💵 Caja USD                             │
│ 1,000.00           │ 2.00                                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 📚 Histórico de Cierres                                    │
├─────────────────────────────────────────────────────────────┤
│ Fecha    │ Ventas CUP │ Ventas USD │ Total │ Inv │ Gan │ Caja│
├─────────────────────────────────────────────────────────────┤
│ 01/01/24 │ 1,000.00   │ 2.00       │ 1,700 │ 130 │ 1,570│1,000│
│ 31/12/23 │ 800.00     │ 1.50       │ 1,325 │ 100 │ 1,225│ 800│
│ 30/12/23 │ 1,200.00   │ 3.00       │ 2,250 │ 180 │ 2,070│1,200│
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Diferencias Clave con la Versión Anterior

### ❌ Eliminado
- "Para Reponer" (confuso, no es necesario)
- Cálculos combinados que mezclaban CUP y USD
- Estructura compleja con muchos cálculos intermedios

### ✅ Agregado
- **Separación clara** de CUP y USD en cada métrica
- **Totales combinados** al final (CUP + USD convertido)
- **Flujo lógico**: Ventas → Inversión → Ganancia → Gastos → Neta → Distribución
- **Caja separada** (CUP y USD) para verificar dinero real

---

## 💡 Ejemplo Completo de Negocio

### Escenario Real
**Tasa:** 350 CUP/USD

**Ventas de la semana:**
- Lunes: 500 CUP (costo: 300 CUP)
- Martes: 2 USD (costo: 1 USD)
- Miércoles: 1,000 CUP (costo: 600 CUP)
- Jueves: 5 USD (costo: 3 USD)
- Viernes: 800 CUP (costo: 500 CUP)

**Gastos de la semana:**
- Electricidad: 200 CUP
- Internet: 100 CUP

### Cálculos

**1. VENTAS**
```
Ventas CUP = 500 + 1,000 + 800 = 2,300 CUP
Ventas USD = 2 + 5 = 7 USD
Ventas Total = 2,300 + (7 × 350) = 4,750 CUP ≈ 13.57 USD
```

**2. INVERSIÓN**
```
Inversión CUP = 300 + 600 + 500 = 1,400 CUP
Inversión USD = 1 + 3 = 4 USD
Inversión Total = 1,400 + (4 × 350) = 2,800 CUP ≈ 8.00 USD
```

**3. GANANCIA**
```
Ganancia CUP = 2,300 - 1,400 = 900 CUP
Ganancia USD = 7 - 4 = 3 USD
Ganancia Total = 4,750 - 2,800 = 1,950 CUP ≈ 5.57 USD
```

**4. GASTOS**
```
Gastos = 200 + 100 = 300 CUP
```

**5. GANANCIA NETA**
```
Ganancia Neta = 1,950 - 300 = 1,650 CUP ≈ 4.71 USD
```

**6. DISTRIBUCIÓN (10% dependienta)**
```
Accionista 1 = 1,650 × 50% = 825 CUP ≈ 2.36 USD
Accionista 2 = 1,650 × 50% = 825 CUP
Dependienta = 825 × 10% = 82.5 CUP ≈ 0.24 USD
Accionista 2 Neto = 825 - 82.5 = 742.5 CUP ≈ 2.12 USD
```

**7. CAJA**
```
Caja CUP = 2,300 (ventas en CUP)
Caja USD = 7 (ventas en USD)
```

---

## ✅ Beneficios de la Nueva Estructura

1. **Claridad**: Cada métrica se muestra en CUP, USD y Total
2. **Verificación**: Puedes verificar que Ventas = Caja (si todo fue en efectivo)
3. **Lógica de negocio**: Sigue el flujo natural: Ventas → Costo → Ganancia → Gastos → Neta
4. **Distribución clara**: Se calcula sobre la ganancia neta (después de gastos)
5. **Caja separada**: Sabes exactamente cuánto tienes en cada moneda

---

## 🔧 Configuración Necesaria

Para que la distribución funcione correctamente, configura en **Ajustes**:

1. **% Dependienta**: Porcentaje que recibe la dependienta del Accionista 2
2. **Nombres**: Personaliza los nombres de Accionista 1, Accionista 2 y Dependienta

---

## 📝 Notas Importantes

1. **Inversión**: Se calcula usando el método FIFO (First In, First Out) basado en los lotes de compra
2. **Ganancia**: Es la diferencia entre ventas e inversión (costo real)
3. **Ganancia Neta**: Es la ganancia después de restar todos los gastos
4. **Distribución**: Se calcula sobre la ganancia neta, no sobre la ganancia bruta
5. **Caja**: Solo incluye efectivo y transferencias (no crédito)

---

**Última actualización:** 2024  
**Estado:** ✅ Listo para producción
