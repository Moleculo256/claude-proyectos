# proyectos

Proyectos al estilo Claude Cowork para Claude Code: agrupa chats que comparten instrucciones y memoria.

- Al empezar un chat aparece «¿Proyecto para este chat?» con un botón por proyecto.
- Las instrucciones y notas del proyecto llegan a Claude en cada chat del grupo.
- Claude guarda decisiones y pendientes con la herramienta `guardar_nota`, que leen los demás chats.
- `/proyecto chats` lista los chats del proyecto con el comando para reabrirlos.

## Instalación

En la línea de comandos de una sesión de Claude Code en el terminal:

```
/plugin install proyectos --marketplace Moleculo256/claude-proyectos
```

Responde `y` para añadir el marketplace y elige el ámbito de usuario.

Desde una shell:

```
claude plugin install proyectos --marketplace Moleculo256/claude-proyectos
```

En la app de escritorio, donde `/plugin` no funciona: pulsa + junto al cuadro de texto, luego Plugins, Add marketplace con `Moleculo256/claude-proyectos`, y después Add plugin.

El repositorio es privado: tu equipo necesita una credencial de git para github.com (una clave SSH, o `gh auth login` y luego `gh auth setup-git`).

## Comandos

| Comando | Qué hace |
| --- | --- |
| `/proyecto` | Muestra el proyecto activo y la lista |
| `/proyecto nuevo <nombre>` | Crea un proyecto y mete este chat en él |
| `/proyecto usar <nombre>` | Mete este chat en un proyecto existente |
| `/proyecto chats [nombre]` | Lista los chats del proyecto |
| `/proyecto instrucciones <texto>` | Fija las instrucciones del proyecto |
| `/proyecto nota <texto>` | Añade una nota a la memoria |
| `/proyecto olvidar <n>` | Borra la nota número n |
| `/proyecto carpeta` | Los chats nuevos en esta carpeta entran solos en el proyecto |
| `/proyecto salir` | Saca este chat del proyecto |
| `/proyecto borrar <nombre>` | Elimina un proyecto |
| `/proyecto panel` | Abre el panel lateral |
