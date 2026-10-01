# 🎉 VYBE - Prompt para Recrear el Proyecto

## Descripción General

**Vybe** es una aplicación de networking social para eventos y fiestas. Permite a usuarios conectar con otras personas en eventos verificados por ubicación y código QR. Los locales/venues pueden gestionar eventos y generar códigos QR dinámicos.

---

## Stack Tecnológico

```
Frontend:
- React 18.3.1 + TypeScript
- Vite (bundler)
- Tailwind CSS con tema personalizado
- shadcn/ui para componentes base
- React Router DOM 6.x para navegación
- TanStack Query para gestión de estado del servidor
- Framer Motion (lucide-react para iconos)
- qrcode.react para generación de QR

Backend:
- Supabase (autenticación, base de datos, Edge Functions)
- Edge Functions en Deno para verificación SMS/email
```

---

## Arquitectura de la Aplicación

```
┌─────────────────────────────────────────────────────────────┐
│                        VYBE APP                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │   Landing    │───▶│     Auth     │───▶│   Location   │   │
│  │   (Index)    │    │  (SMS/Email) │    │  (GPS + QR)  │   │
│  └──────────────┘    └──────────────┘    └──────────────┘   │
│         │                                        │           │
│         │                                        ▼           │
│         │            ┌──────────────────────────────────┐   │
│         │            │           HOME PAGE              │   │
│         │            │    (Swipe Cards + Matching)      │   │
│         │            └──────────────────────────────────┘   │
│         │                          │                        │
│         │            ┌─────────────┴─────────────┐          │
│         │            ▼                           ▼          │
│         │   ┌──────────────┐           ┌──────────────┐    │
│         │   │   Matches    │           │    Chat      │    │
│         │   │   (Vybes)    │──────────▶│  (Messages)  │    │
│         │   └──────────────┘           └──────────────┘    │
│         │                                                   │
│         │   ┌───────────────────────────────────────────┐  │
│         └──▶│           VENUE DASHBOARD                 │  │
│             │  (QR Generator + Events + Statistics)     │  │
│             └───────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Tipos de Usuario

### 1. Usuario Normal
- Registro con número de teléfono
- Verificación por código SMS de 6 dígitos
- Verificación facial con selfie
- Escaneo de código QR del evento para acceder
- Verificación de ubicación GPS
- Puede hacer swipe (like/dislike) a otros usuarios
- Puede chatear con matches

### 2. Venue/Local (Empresarial)
- Registro con email empresarial
- Tipos: discoteca, bar, festival, fiesta_privada, evento_empresarial, local
- Genera códigos QR únicos por evento
- Configura radio de proximidad (25m - 500m según tipo)
- Gestiona eventos con fechas, precios, dress code, etc.
- Ve estadísticas de usuarios en el evento

---

## Modelos de Datos (TypeScript)

### User
```typescript
interface User {
  id: string;
  name: string;
  age: number;
  bio: string;
  photos: string[];
  distance?: number;
  lastActive?: string;
  isVerified: boolean;
  phone?: string;
  phoneVerified?: boolean;
  faceVerified?: boolean;
  location?: {
    latitude: number;
    longitude: number;
  };
}
```

### Venue
```typescript
interface Venue {
  id: string;
  name: string;
  email: string;
  type: VenueType; // 'discoteca' | 'bar' | 'festival' | 'fiesta_privada' | 'evento_empresarial' | 'local'
  isVerified: boolean;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  eventRadius: number;
  qrCode?: string;
  phone?: string;
  phoneVerified?: boolean;
  documents?: string[];
}
```

### Event
```typescript
interface Event {
  id: string;
  name: string;
  venueId: string;
  startDate: string;
  endDate: string;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  minAge?: number;
  maxAge?: number;
  theme?: string;
  dressCode?: string;
  price?: number;
  bookingUrl?: string;
  qrCode?: string;
  description?: string;
}
```

### Message
```typescript
interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  read: boolean;
  createdAt: string;
}
```

### Connection
```typescript
interface Connection {
  id: string;
  userId1: string;
  userId2: string;
  connectionType: 'vybe_check' | 'match';
  createdAt: string;
}
```

---

## Estructura de Carpetas

```
src/
├── assets/                    # Imágenes y assets estáticos
│   └── vybe_logo.png
├── components/
│   ├── ui/                    # Componentes shadcn/ui
│   ├── ui-custom/             # Componentes personalizados
│   │   └── party-button.tsx   # Botón con gradiente neón
│   ├── venue/                 # Componentes específicos de venues
│   │   ├── create-event-form.tsx
│   │   └── venue-qr-code.tsx
│   ├── chat-window.tsx
│   ├── connection-list-item.tsx
│   ├── face-verification.tsx
│   ├── footer.tsx
│   ├── header.tsx
│   ├── match-dialog.tsx
│   ├── match-list-item.tsx
│   ├── premium-features.tsx
│   ├── profile-card.tsx
│   └── qr-scanner.tsx
├── context/
│   ├── app-context.tsx        # Estado global de la app
│   └── premium-context.tsx    # Estado de suscripción premium
├── hooks/
│   ├── use-mobile.tsx
│   └── use-toast.ts
├── pages/
│   ├── venue/
│   │   ├── VenueAuthPage.tsx
│   │   └── VenueDashboardPage.tsx
│   ├── AuthPage.tsx
│   ├── ChatPage.tsx
│   ├── HomePage.tsx
│   ├── Index.tsx
│   ├── LocationPage.tsx
│   ├── MatchesPage.tsx
│   ├── NotFound.tsx
│   └── ProfilePage.tsx
├── services/
│   ├── api.ts                 # Mock API service
│   └── seed-service.ts
├── types/
│   ├── user.ts
│   └── venue.ts
├── integrations/
│   └── supabase/
│       └── client.ts
├── lib/
│   └── utils.ts
├── App.tsx
├── App.css
├── index.css                  # Tema y variables CSS
└── main.tsx

supabase/
├── config.toml
└── functions/
    ├── send-sms-verification/
    │   └── index.ts
    └── send-email-verification/
        └── index.ts
```

---

## Rutas de la Aplicación

| Ruta | Componente | Descripción |
|------|------------|-------------|
| `/` | Index | Landing page - selección usuario/venue |
| `/auth` | AuthPage | Autenticación de usuarios (SMS) |
| `/location` | LocationPage | Verificación GPS + escaneo QR |
| `/home` | HomePage | Pantalla principal con swipe cards |
| `/matches` | MatchesPage | Lista de conexiones/vybes |
| `/chat/:userId` | ChatPage | Chat con un match específico |
| `/profile` | ProfilePage | Perfil del usuario |
| `/venue/auth` | VenueAuthPage | Autenticación de venues (email) |
| `/venue/dashboard` | VenueDashboardPage | Dashboard del venue |

---

## Paleta de Colores (HSL)

```css
:root {
  /* Colores principales - Tema neón/party */
  --party-primary: 280 100% 60%;      /* Púrpura neón */
  --party-primary-glow: 280 100% 70%;
  --party-secondary: 200 100% 50%;    /* Azul eléctrico */
  --party-accent: 340 100% 60%;       /* Rosa neón */
  --party-accent-glow: 340 100% 70%;
  
  /* Fondos oscuros */
  --background: 260 30% 8%;           /* Negro azulado */
  --foreground: 0 0% 98%;
  --card: 260 25% 12%;
  --card-foreground: 0 0% 98%;
  
  /* Superficies */
  --muted: 260 20% 18%;
  --muted-foreground: 260 10% 65%;
  
  /* Gradientes */
  --party-gradient: linear-gradient(135deg, 
    hsl(280 100% 60%), 
    hsl(340 100% 60%));
  --card-gradient: linear-gradient(180deg, 
    hsl(260 25% 15%), 
    hsl(260 30% 8%));
  --match-gradient: linear-gradient(135deg, 
    hsl(340 100% 60%), 
    hsl(280 100% 60%));
  
  /* Estados */
  --success: 142 76% 45%;
  --error: 0 84% 60%;
  --warning: 38 92% 50%;
}
```

---

## Características Clave

### 1. Sistema de Swipe
- Tarjetas de perfil con foto, nombre, edad, bio
- Swipe izquierda = dislike (X)
- Swipe derecha = like (✓)
- Super like (★) solo para premium
- Animación de match cuando hay conexión mutua

### 2. Verificación de Evento
- Escaneo de código QR generado por el venue
- Código manual de 6 caracteres como alternativa
- Verificación de ubicación GPS dentro del radio configurado
- Los códigos QR se regeneran diariamente

### 3. Radio de Proximidad por Tipo de Evento
```typescript
const radiusByVenueType = {
  discoteca: 100,      // metros
  bar: 50,
  festival: 500,
  fiesta_privada: 25,
  evento_empresarial: 200,
  local: 75
};
```

### 4. Persistencia de Sesión
- Estado guardado en localStorage
- Claves: `vybe_isLoggedIn`, `vybe_currentUser`, `vybe_userType`, etc.
- Restauración automática al recargar

### 5. Edge Functions (Supabase/Deno)
- `send-sms-verification`: Envío simulado de códigos SMS
- `send-email-verification`: Envío simulado de emails

---

## Componentes Principales

### PartyButton
Botón personalizado con gradiente neón y efectos de brillo:
```tsx
<PartyButton variant="primary" size="lg" onClick={handleClick}>
  ¡Entrar a la Fiesta!
</PartyButton>
```

### ProfileCard
Tarjeta de perfil para swipe con foto, info y botones de acción.

### QRScanner
Escáner de códigos QR con opción de entrada manual.

### MatchDialog
Modal que aparece cuando hay un match mutuo.

### ChatWindow
Interfaz de chat con mensajes en tiempo real.

---

## Flujo de Autenticación Usuario

```
1. Landing (/) → Selecciona "Soy Usuario"
2. AuthPage (/auth) → Ingresa teléfono
3. Recibe código SMS (simulado)
4. Ingresa código de 6 dígitos
5. Verificación facial con selfie
6. LocationPage (/location) → Activa GPS
7. Escanea QR del evento o ingresa código manual
8. HomePage (/home) → ¡Listo para hacer swipe!
```

## Flujo de Autenticación Venue

```
1. Landing (/) → Selecciona "Soy un Local"
2. VenueAuthPage (/venue/auth) → Ingresa datos del local
3. Selecciona tipo de venue
4. Verifica email con código
5. VenueDashboardPage (/venue/dashboard) → Dashboard activo
```

---

## Instrucciones de Configuración

### 1. Crear Proyecto
```bash
npm create vite@latest vybe-app -- --template react-ts
cd vybe-app
```

### 2. Instalar Dependencias
```bash
npm install @tanstack/react-query react-router-dom tailwindcss postcss autoprefixer
npm install @radix-ui/react-dialog @radix-ui/react-tabs @radix-ui/react-avatar
npm install lucide-react qrcode.react class-variance-authority clsx tailwind-merge
npm install @supabase/supabase-js sonner
```

### 3. Configurar shadcn/ui
```bash
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card dialog tabs avatar input toast
```

### 4. Configurar Supabase
- Crear proyecto en supabase.com
- Configurar tablas: users, venues, events, connections, messages
- Crear Edge Functions para SMS y email
- Configurar variables de entorno

### 5. Variables de Entorno
```env
VITE_SUPABASE_URL=https://[project-id].supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=[anon-key]
```

---

## Notas Importantes

1. **Tema Oscuro Obligatorio**: La app usa exclusivamente tema oscuro con acentos neón
2. **Mobile First**: Diseñada principalmente para dispositivos móviles
3. **Simulación**: Los servicios de SMS/email son simulados en desarrollo
4. **LocalStorage**: Se usa para persistir sesión (no hay auth real implementada aún)
5. **Mock Data**: La API usa datos mockeados en `services/api.ts`

---

## Prompt Resumido para IA

> Crea una aplicación React + TypeScript llamada "Vybe" para networking social en eventos. 
> Usa Tailwind CSS con tema oscuro y colores neón (púrpura #9333ea, rosa #ec4899). 
> Implementa: landing page con selección usuario/venue, autenticación por SMS/email con códigos de 6 dígitos, 
> verificación de ubicación GPS + escaneo QR, sistema de swipe cards estilo Tinder, 
> lista de matches, chat en tiempo real, y dashboard para venues con generación de QR.
> Usa shadcn/ui para componentes base, React Router para navegación, y Supabase para backend.
> El radio de proximidad varía según tipo de venue (25m-500m).
> Persiste la sesión en localStorage.

---

*Generado para Vybe v1.0 - Diciembre 2024*
