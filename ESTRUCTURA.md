# 📁 Estructura del Proyecto La Parada

## Raíz del Proyecto

```
la-parada/
├── 📄 index.html                 # Punto de entrada (Vite) - NO EDITAR MANUALMENTE
├── 📄 vite.config.ts             # Configuración de Vite
├── 📄 tsconfig.json              # Configuración de TypeScript
├── 📄 tailwind.config.ts          # Configuración de Tailwind CSS
├── 📄 postcss.config.js           # Configuración de PostCSS
├── 📄 package.json                # Dependencias del proyecto
│
├── 🔐 Archivos de Configuración (Variables de Entorno)
│   ├── .env.example               # PLANTILLA - Para referencia
│   ├── .env.local                 # DESARROLLO - Variables locales (gitignored)
│   ├── .env.production            # PRODUCCIÓN - Para Cloudflare Pages
│
├── 📂 src/                        # CÓDIGO FUENTE
│   ├── main.tsx                   # Punto de entrada React
│   ├── App.tsx                    # Componente principal
│   ├── index.css                  # Estilos globales
│   ├── vite-env.d.ts              # Tipos de Vite
│   ├── 🎨 components/             # Componentes React reutilizables
│   │   ├── layout/                # Componentes de layout
│   │   ├── ui/                    # Componentes UI simples
│   │   ├── pos/                   # Componentes del POS
│   │   ├── productos/             # Componentes de productos
│   │   ├── domicilios/            # Componentes de domicilios
│   │   └── reportes/              # Componentes de reportes
│   ├── 📄 pages/                  # Páginas/Vistas
│   ├── 🔗 context/                # Context API (Auth, Negocio)
│   ├── 🪝 hooks/                  # Hooks personalizados
│   ├── 🛠️ services/               # Servicios (Firebase, APIs)
│   │   └── firebase.ts            # Configuración de Firebase
│   ├── 📦 types/                  # TypeScript interfaces/types
│   └── 🧰 utils/                  # Funciones utilitarias
│
├── 📂 firebase-functions/         # Firebase Cloud Functions
│   ├── src/                       # Código fuente TypeScript
│   │   ├── ai/                    # Servicios de IA (Claude)
│   │   ├── analytics/             # Servicios de Analytics
│   │   ├── bot/                   # Lógica del Bot WhatsApp
│   │   ├── loyalty/               # Sistema de lealtad
│   │   ├── surveys/               # Encuestas
│   │   ├── webhook/               # Webhooks
│   │   └── utils/                 # Utilidades
│   └── index.js                   # Compilado (generado)
│
├── 📂 public/                     # Archivos estáticos públicos
│   └── sounds/                    # Archivos de audio
│
├── 📂 dist/                       # BUILD COMPILADO (generado por npm run build)
│   ├── index.html                 # Archivo HTML compilado
│   ├── assets/                    # JS y CSS compilados
│   └── sounds/                    # Archivos copiados
│
├── 📂 .firebase/                  # Caché de Firebase (gitignored)
├── 📂 node_modules/               # Dependencias (gitignored)
│
├── 🔧 Configuración
│   ├── .npmrc                     # Configuración de npm
│   ├── firebase.json              # Configuración de Firebase
│   ├── firestore.rules            # Reglas de Firestore
│   ├── firestore.indexes.json     # Índices de Firestore
│   └── .gitignore                 # Archivo de exclusiones de Git
│
└── 📖 Documentación
    ├── PHASE_7_ENV_SETUP.md       # Guía de configuración
    └── PHASE_8_BOT_GUIDE.md       # Guía del Bot
```

## 🎯 Variables de Entorno

### `.env.example` (Plantilla)

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
# ... etc
```

### `.env.local` (Desarrollo Local)

- ✅ Incluye todas las credenciales de desarrollo
- ❌ NO se sube a Git (está en .gitignore)
- 📍 Se usa con `npm run dev`

### `.env.production` (Producción)

- ✅ Incluido en el repo (Cloudflare Pages lo necesita)
- 📍 Se usa con `npm run build`
- ⚠️ Las API Keys de Firebase son públicas por diseño

## 🔄 Ciclos de Build

### Desarrollo

```bash
npm run dev
# Lee: .env.local (si existe) o .env.example
```

### Producción

```bash
npm run build
# Lee: .env.production
# Genera: dist/ (nunca comitear)
```

## ✅ Lo que es Normal

| Aspecto                 | Por qué                                 |
| ----------------------- | --------------------------------------- |
| 2 `index.html`          | Fuente en raíz + compilado en `dist/`   |
| 3 `.env`                | Ejemplo + desarrollo + producción       |
| Carpeta `dist/`         | Se genera automáticamente en cada build |
| Carpeta `node_modules/` | Dependencias (gitignored)               |

## 📋 Checklist de Archivos

- ✅ `index.html` (raíz) - Mantener, Vite lo necesita
- ✅ `dist/` - Ignorar, generado automáticamente
- ✅ `.env.example` - Mantener, para documentación
- ✅ `.env.local` - Mantener local, gitignored
- ✅ `.env.production` - Incluido en repo, para CI/CD

## 🚀 Comandos Útiles

```bash
# Desarrollo
npm run dev          # Inicia servidor local

# Producción
npm run build        # Compila para producción
npm run preview      # Vista previa del build

# Deploy
firebase deploy      # Deploy a Firebase Hosting
# Cloudflare Pages se sincroniza automáticamente de GitHub
```
