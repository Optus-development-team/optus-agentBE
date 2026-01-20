# Google Workspace Add-on: Optus Sheets Sync

Este Add-on sincroniza datos de Google Sheets con el backend de Optus BMS.

## Instalación

1. Abre tu Google Spreadsheet
2. Ve a **Extensiones > Apps Script**
3. Copia los archivos de este directorio:
   - `Code.gs` → Lógica principal
   - `SidebarFunctions.gs` → Funciones del sidebar
   - `Sidebar.html` → UI del sidebar
4. Copia el contenido de `appsscript.json` al archivo de manifiesto (Ver > Mostrar archivo de manifiesto)
5. Guarda el proyecto
6. Refresca el spreadsheet

## Configuración

1. Después de refrescar, aparecerá el menú **⚡ Optus Sync**
2. Click en **📋 Configurar**
3. Ingresa:
   - **Company ID**: UUID de tu empresa en Optus BMS
   - **Secret Key**: Clave secreta del webhook
   - **Webhook URL** (opcional): URL personalizada del endpoint

## Uso

### Sincronización Manual
- **Sincronizar hoja actual**: Envía solo la hoja activa
- **Sincronizar todas las hojas**: Envía todas las hojas del spreadsheet

### Sincronización Automática
- **Activar auto-sync**: Instala un trigger que sincroniza automáticamente cada vez que edites una celda
- **Desactivar auto-sync**: Remueve el trigger automático

## Convención de Privacidad

Las hojas cuyo nombre empiece con `[PRIV]` se marcan como **privadas**:

| Nombre de Hoja | Privacidad | Acceso del Agente IA |
|----------------|------------|----------------------|
| `Horarios` | Pública | ✅ Puede leer |
| `Inventario` | Pública | ✅ Puede leer |
| `[PRIV] Costos` | Privada | ❌ No puede leer |
| `[PRIV] Prospectos` | Privada | ❌ No puede leer |

**Nota:** Los datos privados SÍ se sincronizan con el backend para uso administrativo, pero el Agente IA no tiene acceso a ellos.

## Estructura del Payload

```json
{
  "company_id": "uuid-de-empresa",
  "sheet_name": "Horarios",
  "is_public": true,
  "data": [
    { "_rowId": "2", "dia": "Lunes", "hora": "9am" },
    { "_rowId": "3", "dia": "Martes", "hora": "10am" }
  ],
  "metadata": {
    "spreadsheet_id": "abc123",
    "spreadsheet_name": "Mi CMS",
    "last_updated": "2026-01-20T10:00:00Z"
  }
}
```

## Troubleshooting

### El menú no aparece
- Refresca la página
- Verifica que hayas guardado los scripts

### Error de autorización
- Ve a Apps Script y ejecuta `onOpen()` manualmente
- Acepta los permisos solicitados

### Los datos no se sincronizan
- Verifica la configuración (Company ID, Secret Key)
- Revisa los logs en Apps Script (Ver > Registros de ejecución)
- Asegúrate de que el backend esté corriendo
