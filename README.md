# Atria — PWA personal

Atria es una PWA local para registrar comidas, síntomas, menstruación y medicación, y explorar posibles asociaciones temporales.

## PIN

PIN inicial: **2917**

El dispositivo queda recordado tras introducirlo correctamente. En Ajustes > Privacidad puedes usar **Bloquear ahora** para pedirlo otra vez.

> El PIN es una barrera de privacidad de la interfaz, no cifrado fuerte. La seguridad principal sigue siendo el código/Face ID del iPhone.

## Qué incluye esta V1

- Calendario mensual, empezando en lunes.
- Registro de comida, síntoma, menstruación y medicación.
- Alimentos organizados por categorías y posibilidad de añadir nuevos.
- Síntomas con intensidad 1–10, duración rápida, notas y favoritos.
- Menstruación con flujo y dolor 0–10.
- Medicación con dosis y hora.
- Edición y borrado con confirmación.
- Análisis por 30 días, 3 meses, 6 meses o todo el historial.
- Alimentos más repetidos y síntomas más frecuentes.
- Posibles asociaciones alimento → síntoma con ventana configurable.
- Análisis sencillo de ciclo y síntomas.
- Exportación/restauración JSON y exportación CSV.
- Tema oscuro/claro/sistema.
- IndexedDB local y Service Worker para uso offline.

## Publicarla gratis con GitHub Pages

1. Crea una cuenta gratuita en GitHub si no tienes una.
2. Crea un repositorio nuevo, por ejemplo `atria-personal`.
3. En GitHub Free, el repositorio debe ser público para usar Pages gratis. El código será visible, pero tus registros NO se suben: viven en IndexedDB en tu navegador.
4. Descomprime `atria-pwa.zip` en tu ordenador.
5. Dentro del repositorio: **Add file > Upload files** y sube el contenido de la carpeta (index.html, app.js, styles.css, sw.js, manifest.webmanifest, .nojekyll y la carpeta icons). No subas el ZIP como único archivo.
6. Haz commit de los archivos.
7. Ve a **Settings > Pages**.
8. En **Build and deployment > Source**, selecciona **Deploy from a branch**.
9. Elige la rama `main` y la carpeta `/(root)` y pulsa **Save**.
10. Cuando GitHub muestre la dirección del sitio, ábrela primero en Safari con Internet.

## Añadirla al iPhone

1. Abre la URL publicada en **Safari**.
2. Pulsa **Compartir**.
3. Pulsa **Añadir a pantalla de inicio**.
4. Activa **Abrir como app web** si aparece esa opción.
5. Pulsa **Añadir**.
6. Abre Atria desde su nuevo icono e introduce **2917** una vez.

Tras cargarla correctamente una primera vez, el Service Worker permite abrir la interfaz sin conexión. Los registros se guardan localmente en el dispositivo.

## Copias de seguridad

Usa **Ajustes > Copia de seguridad > Exportar copia JSON** regularmente. Guarda el archivo en Archivos/iCloud Drive u otra ubicación segura.

La importación reemplaza todos los datos que haya en ese navegador. El CSV sirve para revisar los datos fuera de Atria; el JSON es el formato de restauración.

## Importante sobre privacidad

GitHub Pages aloja únicamente los archivos estáticos de la aplicación. Atria no contiene código para enviar tus comidas o síntomas a GitHub ni a otro servidor. Aun así, el almacenamiento web local no debe considerarse una copia de seguridad infalible, por eso conviene exportar JSON periódicamente.
