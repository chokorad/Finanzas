# Finanzas — cómo ponerla a funcionar (una sola vez, ~20 min)

Todo es gratis y sin tarjeta. Son 7 pasos; los tres secretos de GitHub (pasos 5 y 6) son lo único delicado.

## 1. Subirla a GitHub
GitHub Desktop → File → **Add local repository** → elige `C:\Users\mario\Claude\Finanzas` (si pregunta, crea el repositorio) → **Publish repository** con nombre `Finanzas`, **sin** marcar "Keep this code private" (GitHub Pages gratis lo necesita público; aquí no hay datos tuyos, solo código).

## 2. Activar GitHub Pages
En github.com/chokorad/Finanzas → Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)` → Save. La app queda en `https://chokorad.github.io/Finanzas/`.

## 3. Firebase (ya casi está)
Usa el mismo proyecto de Cobros (`cobros-97f8b`), así que el inicio de sesión con Google y las reglas ya sirven (cubren todo `users/{uid}`). Solo confirma en Firebase → Authentication → Settings → Authorized domains que aparezca `chokorad.github.io`.

## 4. Activar la API de Google Drive (para los archivos de "Por cobrar")
Entra a `https://console.cloud.google.com/apis/library/drive.googleapis.com`, arriba elige el proyecto **cobros-97f8b** y pulsa **Enable**. Es gratis.

## 5. Llave para que GitHub lea tu base de datos
Firebase → ⚙ Configuración del proyecto → **Cuentas de servicio** → *Generar nueva clave privada* → se baja un `.json`.
GitHub → repo `Finanzas` → Settings → Secrets and variables → Actions → New repository secret:
- Nombre `FIREBASE_SERVICE_ACCOUNT`, valor: **todo el contenido** del `.json`.
Después **borra el `.json` de tu compu** (no lo pegues en ningún chat ni lo subas al repo).

## 6. Contraseña de aplicación de Gmail
`https://myaccount.google.com/apppasswords` (necesita verificación en dos pasos activa) → crea una llamada "Finanzas" → copia las 16 letras.
Dos secretos más en GitHub:
- `GMAIL_USER` = `mariohquintero@gmail.com`
- `GMAIL_APP_PASSWORD` = las 16 letras, sin espacios

## 7. Probar
Repo → pestaña **Actions** → *Avisos por correo* → **Run workflow** → modo `prueba`. En un minuto debe llegarte un correo que empieza con `[PRUEBA]`. Luego abre la app, entra con Google y toca **Cargar mis datos iniciales**. En el celular: menú del navegador → Agregar a pantalla de inicio.

## Cómo te avisa
- Lunes a viernes a las 7:00 (todo) y 21:00 (solo lo urgente).
- Jueves y viernes también incluye lo que vence sábado, domingo y lunes.
- Sigue avisando hasta que marques **Pagado / Hecho / Usado / Cobrado** en la app.
- Si un lunes no hay nada pendiente, igual llega un correo "todo en orden" para que sepas que el sistema sigue vivo.
- Si GitHub falla, te manda su propio correo de "workflow failed".

## Notas
- Colegiatura: la dejé empezando en **diciembre** (1 al 5). Si la de noviembre aún no está pagada, agrégala/ajústala desde la app.
- Para cambiar días, montos o condiciones: botón ✎ en cada tarjeta.
- GitHub apaga los horarios de repos sin actividad en 60 días; el flujo incluye un paso que lo reactiva solo. Si algún día dejan de llegar correos, entra a Actions y revisa si dice "disabled".

## Prompt para otro agente
"Read AGENTS.md, ARCHITECTURE.md and FEATURES.md first. Then make this change: <cambio>. Update CHANGELOG.md when done."
