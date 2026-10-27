# 🔧 Solución de Problemas - Inventario

## Problema: No se ven los productos en el inventario

### Causas Posibles y Soluciones

#### 1. Productos no se están guardando

**Síntoma:** Creas un producto pero no aparece en la lista

**Solución:**
1. Abre la consola del navegador (F12)
2. Ve a la pestaña "Console"
3. Intenta crear un producto
4. Busca errores en rojo

**Errores comunes:**
- `Cannot read property 'stockTienda' of undefined` → Problema con migración
- `IndexedDB error` → Problema con la base de datos

**Solución rápida:**
```bash
# Limpiar datos y empezar de nuevo
1. Abre la consola del navegador (F12)
2. Ve a Application > IndexedDB
3. Click derecho en "ferreteriasuarez" > Delete
4. Recarga la página
```

#### 2. Productos se guardan pero no se muestran

**Síntoma:** Creas un producto, se guarda, pero no aparece en la lista

**Posibles causas:**
- Filtros activos que ocultan el producto
- Búsqueda activa
- Vista incorrecta (grid vs tabla)

**Solución:**
1. Limpia el campo de búsqueda
2. Selecciona "Todos" en el filtro de estado
3. Selecciona "Categorías" (sin filtro) en el filtro de categoría
4. Cambia entre vista grid (▦) y tabla (☰)

#### 3. Productos antiguos no se migraron correctamente

**Síntoma:** Productos creados antes de la actualización no aparecen

**Solución:**
La migración automática debería ejecutarse al cargar el inventario. Si no funciona:

```javascript
// Ejecutar en la consola del navegador (F12)
(async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('ferreteriasuarez', 3);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  
  const tx = db.transaction('productos', 'readwrite');
  const store = tx.objectStore('productos');
  const req = store.getAll();
  
  req.onsuccess = async () => {
    const productos = req.result;
    for (const p of productos) {
      if (p.stockTienda === undefined || p.stockAlmacen === undefined) {
        p.stockTienda = p.stockTienda !== undefined ? p.stockTienda : (p.stock || 0);
        p.stockAlmacen = p.stockAlmacen !== undefined ? p.stockAlmacen : 0;
        p.stock = (p.stockTienda || 0) + (p.stockAlmacen || 0);
        await new Promise((resolve, reject) => {
          const putReq = store.put(p);
          putReq.onsuccess = () => resolve();
          putReq.onerror = () => reject(putReq.error);
        });
      }
    }
    console.log('Migración completada:', productos.length, 'productos');
    location.reload();
  };
})();
```

#### 4. Campo "Código" causando problemas

**Solución:** El campo "Código" ha sido eliminado del formulario y las vistas.

**Cambios realizados:**
- ✅ Eliminado del formulario de nuevo producto
- ✅ Eliminado de la vista grid
- ✅ Eliminado de la vista tabla
- ✅ Ya no es necesario rellenar este campo

#### 5. Campos obligatorios

**Único campo obligatorio:** Nombre

**Campos opcionales (con valores por defecto):**
- Categoría: Se selecciona automáticamente la primera categoría
- Unidad: Se selecciona "Unidad" por defecto
- Stock en Tienda: 0 por defecto
- Stock en Almacén: 0 por defecto
- Stock Mín.: 0 por defecto
- Compra CUP/USD: 0 por defecto
- Venta CUP/USD: 0 por defecto
- Foto: Opcional
- Precios fijos: Desactivados por defecto

**Para crear un producto mínimo:**
1. Solo llena el campo "Nombre"
2. Click en "Guardar"
3. El producto se creará con valores por defecto

---

## 🧪 Pasos para Diagnosticar el Problema

### Paso 1: Verificar que los productos se están guardando

1. Abre la consola del navegador (F12)
2. Ve a la pestaña "Application" > "IndexedDB" > "ferreteriasuarez" > "productos"
3. Crea un nuevo producto
4. Verifica que aparezca en la lista de productos en IndexedDB

**Si NO aparece en IndexedDB:**
- Hay un problema con el guardado
- Revisa la consola para ver errores

**Si SÍ aparece en IndexedDB pero no en la UI:**
- Hay un problema con la carga o los filtros
- Continúa con el Paso 2

### Paso 2: Verificar que los productos se están cargando

1. Abre la consola del navegador (F12)
2. Ejecuta este código:

```javascript
(async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('ferreteriasuarez', 3);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  
  const tx = db.transaction('productos', 'readonly');
  const store = tx.objectStore('productos');
  const req = store.getAll();
  
  req.onsuccess = () => {
    console.log('Productos en la base de datos:', req.result);
    console.log('Cantidad:', req.result.length);
  };
})();
```

3. Verifica que los productos aparezcan en la consola

**Si NO aparecen:**
- Los productos no se están guardando
- Revisa el Paso 1

**Si SÍ aparecen:**
- Los productos están en la base de datos
- El problema es con la UI o los filtros
- Continúa con el Paso 3

### Paso 3: Verificar filtros y búsqueda

1. Limpia el campo de búsqueda
2. Selecciona "Todos" en el filtro de estado
3. Selecciona "Categorías" (sin filtro) en el filtro de categoría
4. Verifica que los productos aparezcan

**Si aún no aparecen:**
- Hay un problema con el renderizado
- Continúa con el Paso 4

### Paso 4: Recargar la aplicación

1. Guarda todos los datos (Respaldo > Exportar JSON)
2. Limpia los datos del navegador:
   - F12 > Application > IndexedDB > ferreteriasuarez > Delete
3. Recarga la página
4. Restaura los datos (Respaldo > Importar JSON)

---

## 📋 Checklist de Verificación

- [ ] Campo "Nombre" está lleno (único campo obligatorio)
- [ ] Click en "Guardar" muestra mensaje "Creado"
- [ ] Producto aparece en IndexedDB (F12 > Application > IndexedDB)
- [ ] Campo de búsqueda está vacío
- [ ] Filtro de estado está en "Todos"
- [ ] Filtro de categoría está en "Categorías"
- [ ] Vista grid (▦) o tabla (☰) está seleccionada
- [ ] Página recargada después de crear producto

---

## 🆘 Solución Definitiva

Si nada funciona, reinicia completamente:

```bash
# 1. Exportar datos (si tienes datos importantes)
# Ve a Respaldo > Exportar JSON

# 2. Limpiar todo
# F12 > Application > IndexedDB > ferreteriasuarez > Delete

# 3. Recargar página
# Ctrl+F5

# 4. Crear producto de prueba
# Solo llena "Nombre" y guarda

# 5. Verificar que aparece
```

---

## 📞 Soporte

Si el problema persiste:

1. Abre la consola del navegador (F12)
2. Copia todos los errores en rojo
3. Describe los pasos que seguiste
4. Indica cuántos productos tienes en IndexedDB

**Comando para verificar productos en IndexedDB:**
```javascript
(async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('ferreteriasuarez', 3);
    req.onsuccess = () => resolve(req.result);
  });
  const tx = db.transaction('productos', 'readonly');
  const store = tx.objectStore('productos');
  const req = store.getAll();
  req.onsuccess = () => console.log('Productos:', req.result);
})();
```

---

## ✅ Cambios Recientes

- ✅ Eliminado campo "Código" del formulario
- ✅ Eliminado campo "Código" de la vista grid
- ✅ Eliminado campo "Código" de la vista tabla
- ✅ Solo el campo "Nombre" es obligatorio
- ✅ Todos los demás campos tienen valores por defecto
- ✅ Migración automática mejorada
- ✅ Productos se guardan correctamente con stockTienda y stockAlmacen

---

**Última actualización:** 2024
**Estado:** ✅ Listo para producción
