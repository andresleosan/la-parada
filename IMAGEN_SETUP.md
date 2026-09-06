# 📸 Sistema de Imágenes Automáticas para Productos

## 🎯 Qué se hizo

Se implementó un sistema completo que busca automáticamente **imágenes libres de derechos** en Unsplash cuando creas un producto o combo, mostrándolas como fondo en las tarjetas.

## 🚀 Cómo funciona

### 1. **Al crear/editar un producto o combo:**

- Rellena el nombre del producto (ej: "Tequeño", "Panceroti")
- Ve a la sección **"Imagen del Producto"**
- Haz clic en **"🔍 Buscar imagen automáticamente"**
- El sistema busca en Unsplash y muestra una imagen relacionada
- Haz clic en guardar

### 2. **Cómo busca las imágenes:**

- Usa la **API pública de Unsplash** (100% gratis)
- No requiere configuración adicional
- Si la búsqueda falla, genera una URL de Unsplash como fallback
- Todas las imágenes son libres de derechos

### 3. **Alternativas:**

- **Buscar manualmente:** Pega una URL en el campo "O pega aquí una URL de imagen"
- **Cambiar la imagen:** Haz clic en el botón ✕ encima de la imagen para eliminarla

## 📁 Archivos creados/modificados

### ✨ Nuevos:

- `src/services/imageService.ts` - Servicio que busca imágenes en Unsplash

### 🔧 Modificados:

- `src/components/productos/ProductoForm.tsx` - Agregó campo de imagen y búsqueda
- `src/components/productos/ComboForm.tsx` - Agregó campo de imagen y búsqueda
- `src/pages/ProductosPage.tsx` - Muestra imágenes de fondo en tarjetas
- `src/types/index.ts` - Agregó campo `imagenUrl` al tipo `Combo`

## 🎨 Visual

Las tarjetas ahora tienen:

- **Imagen de fondo** (si existe)
- **Overlay oscuro** para que el texto sea legible
- **Botones de control** encima de la imagen
- **Mínimo 240px de altura** para mejor visualización

## 🔗 API utilizado

**Unsplash API** - `https://api.unsplash.com/search/photos`

- Gratis y sin límite práctico para uso personal
- 50 requests/hora (más que suficiente)
- No requiere autenticación
- Retorna imágenes de alta calidad

## ⚙️ Configuración

No requiere configuración adicional. El sistema:

- ✅ Funciona con la API pública de Unsplash
- ✅ No necesita API key
- ✅ Respeta los límites de rate limiting
- ✅ Tiene fallback automático si falla

## 🎯 Ejemplo de uso

### Crear Tequeño con imagen:

1. Nombre: "Tequeño"
2. Descripción: "Tequeño de queso"
3. Precio: 5
4. **Haz clic en "🔍 Buscar imagen automáticamente"**
5. La imagen aparece automáticamente
6. Haz clic en "Crear"

La tarjeta ahora mostrará:

- Imagen de fondo de un tequeño
- Nombre, descripción y precio encima
- Botones de acción (Mostrar, Editar, Eliminar)

## ⚡ Optimización de peso (fotos locales y subidas)

### Fotos gourmet del menú (`/images/products/`)

- Los originales (800-900 KB cada uno) viven en `media/source/` y **no se despliegan**.
- `pnpm run images:optimize` genera con `sharp` las versiones servidas desde `public/`:
  - `<slug>-480.webp` (25-50 KB) para móvil y tarjetas del POS.
  - `<slug>-960.webp` (60-140 KB) para pantallas densas y el storefront.
  - `<slug>.jpg` (75-150 KB) como fallback y para URLs heredadas guardadas en Firestore.
  - `assets/background-table.jpg` (100 KB) para componer el fondo de mesa.
  - `favicon.ico` (2 KB) y `favicon.png` (192px) a partir de `media/source/Logo.jpg`.
- Para cambiar una foto: reemplaza el archivo en `media/source/products/` con el mismo nombre y vuelve a correr el script.
- `src/utils/productImages.ts` resuelve la variante (`getGourmetImage(nombre, fallback, 480 | 960)`) y arma el `srcSet` (`getGourmetImageSrcSet`) que usa el storefront.

### Fotos subidas por el negocio (Firebase Storage)

- Antes de subir, `comprimirImagen` reduce a 960px y codifica en **WebP** (calidad 0.8); en navegadores sin codificador WebP (Safari) usa JPEG.
- Antes de enviar a remove.bg, `prepararImagenParaEdicion` reduce la foto a 1600px (~300 KB) para que el filtro "fondo de mesa" no suba 4-6 MB desde el móvil.
- Los objetos se guardan con `Cache-Control: public, max-age=31536000, immutable` (el nombre lleva UUID).

### Caché en el hosting

- `public/_headers` (Cloudflare Pages) y `firebase.json` (Firebase Hosting) cachean bundles con hash un año y las imágenes 30 días.

## 📝 Notas importantes

- Las imágenes se guardan como **URLs externas** (en Unsplash)
- No ocupan espacio en tu storage
- Son libres de derechos de autor
- Si la URL de Unsplash muere, puedes reemplazarla
- Funciona en **productos y combos**

## 🔍 Búsqueda personalizada

La búsqueda busca por el **nombre del producto**, así que:

- "Arepa" → busca imágenes de arepas
- "Perro" → busca imágenes de hot dogs
- "Panceroti" → busca imágenes de panceroti
- "Hamburguesa" → busca imágenes de hamburguesas

Si la búsqueda no encuentra nada, usa el **fallback automático** que genera una URL genérica.
