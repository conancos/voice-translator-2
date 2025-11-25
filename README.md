# Real-Time Voice Translator

Proyecto Next.js + TypeScript para transcripción y traducción en tiempo real desde el navegador.

## Descripción

Esta aplicación permite grabar audio con el micrófono del navegador y transcribirlo en tiempo real usando la Web Speech API (SpeechRecognition), y si tienes activada la traducción nativa de tu navegador, podrás disponer de dicha traducción en directo, y gestionar tus sesiones guardadas localmente en la UI.

Características principales:
- Grabación y transcripción en tiempo real (interim + final).
- Gestión de sesiones (guardar con "New Session").
- Reproducción (text-to-speech) de sesiones guardadas.
- Soporte multi-idioma para reconocimiento.

## Requisitos
- Node.js >= 16 (se recomienda Node 18+)
- Navegador con soporte para Web Speech API (Chrome o Edge recomendados en escritorio).
- Micrófono y permisos para acceder al mismo.

> Nota: La transcripción se realiza en el navegador; la calidad y comportamiento dependen de la implementación de la API de voz del navegador. Se recomienda disminuir un poco la velocidad de reproducción si el audio viene de Youtube.

## Instalación

Abre PowerShell o tu terminal preferida en la raíz del proyecto y ejecuta:

```powershell
npm install
```

## Desarrollo (arrancar servidor)

Para arrancar en modo desarrollo:

```powershell
npm run dev
```

Esto lanzará el servidor de desarrollo. Abre `http://localhost:3000` en Chrome o Edge, permite el acceso al micrófono y prueba la grabación.

## Qué comprobar si hay problemas con la transcripción
- Usa Chrome o Edge en escritorio para obtener la mejor compatibilidad con Web Speech API.
- Asegúrate de conceder permisos al micrófono.
- Si observas duplicados u otros comportamientos extraños, prueba a recargar la página y volver a iniciar la grabación.
- Si no se transcriben muchas palabras mientras grabas, habla un poco más lento o reduce un poco la velocidad de reproducción del audio (ejemplo 0.75).

## Hitorial de sesiones
- Las sesiones guardadas en la interfaz se almacenan sólo en memoria mientras la aplicación está abierta; si necesitas persistencia, hay que añadir una capa de almacenamiento (localStorage, backend, etc.).

## Contribuir
- Forkea el repositorio y crea PRs con cambios claros.
- Mantén las dependencias actualizadas y revisa compatibilidad con navegadores para Web Speech API.

## Contacto
Si quieres que haga pruebas E2E desde el entorno o que añada persistencia en localStorage/DB, dime y lo preparo.
Puedes contactarme através de Linkedin.


<center>

<mark>&nbsp;**_Hecho con ❤ y mucha paciencia, para contribuir aportando aplicaciones que ayuden o faciliten de algún modo al usuario._**&nbsp;
</mark></center>
