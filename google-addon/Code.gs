/**
 * Optus Sheets Sync - Google Workspace Add-on
 * 
 * Sincroniza datos de Google Sheets con el backend de Optus BMS.
 * Detecta cambios automáticamente y envía los datos al webhook.
 * 
 * Convención de Privacidad:
 * - Hojas que empiezan con "[PRIV]" se marcan como privadas
 * - El Agente IA NO puede leer datos de hojas privadas
 * - Los datos privados SÍ se envían al backend para propósitos administrativos
 * 
 * @see https://developers.google.com/apps-script/guides/triggers
 */

// ============================================================
// CONFIGURACIÓN
// ============================================================

const CONFIG = {
  WEBHOOK_URL_KEY: 'OPTUS_WEBHOOK_URL',
  COMPANY_ID_KEY: 'OPTUS_COMPANY_ID',
  SECRET_KEY: 'OPTUS_SECRET_KEY',
  DEFAULT_WEBHOOK_URL: 'https://your-backend.com/v1/webhooks/sheets/sync',
  DEBOUNCE_MS: 5000, // Esperar 5 segundos antes de enviar cambios
};

// ============================================================
// TRIGGERS & INSTALLATION
// ============================================================

/**
 * Punto de entrada del Add-on (Homepage).
 * Muestra la configuración o estado actual.
 */
function onHomepage(e) {
  const props = PropertiesService.getUserProperties();
  const isConfigured = props.getProperty(CONFIG.COMPANY_ID_KEY) && 
                       props.getProperty(CONFIG.SECRET_KEY);
  
  if (isConfigured) {
    return createStatusCard();
  } else {
    return createConfigCard();
  }
}

/**
 * Se ejecuta cuando se otorgan permisos de archivo.
 */
function onFileScopeGranted(e) {
  return createStatusCard();
}

/**
 * Instala el trigger de edición programáticamente.
 * Llamar desde el menú de configuración.
 */
function installTrigger() {
  // Eliminar triggers existentes para evitar duplicados
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'handleEdit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Crear nuevo trigger onEdit
  ScriptApp.newTrigger('handleEdit')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
  
  Logger.log('Trigger de edición instalado correctamente');
  SpreadsheetApp.getActive().toast('✅ Sincronización automática activada', 'Optus Sync');
}

/**
 * Desinstala el trigger de edición.
 */
function uninstallTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'handleEdit') {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  
  Logger.log(`Eliminados ${removed} triggers`);
  SpreadsheetApp.getActive().toast('🛑 Sincronización desactivada', 'Optus Sync');
}

// ============================================================
// HANDLER DE EDICIÓN
// ============================================================

/**
 * Handler principal para eventos de edición.
 * Se ejecuta en cada cambio de celda.
 * 
 * IMPORTANTE: Los datos privados ([PRIV]) SÍ se envían al backend,
 * pero con is_public: false para que el Agente IA no los lea.
 * 
 * @param {Object} e - Evento de edición de Apps Script
 */
function handleEdit(e) {
  try {
    const sheet = e.source.getActiveSheet();
    const sheetName = sheet.getName();
    
    // Obtener configuración
    const props = PropertiesService.getUserProperties();
    const companyId = props.getProperty(CONFIG.COMPANY_ID_KEY);
    const secretKey = props.getProperty(CONFIG.SECRET_KEY);
    const webhookUrl = props.getProperty(CONFIG.WEBHOOK_URL_KEY) || CONFIG.DEFAULT_WEBHOOK_URL;
    
    if (!companyId || !secretKey) {
      Logger.log('Add-on no configurado. Ignorando edición.');
      return;
    }
    
    // Determinar privacidad basada en el nombre de la hoja
    // IMPORTANTE: NO detener ejecución si es privado - enviar datos igual
    const isPublic = !sheetName.startsWith('[PRIV]');
    
    // Usar PropertiesService para debounce
    const lastSyncKey = `lastSync_${sheetName}`;
    const lastSync = props.getProperty(lastSyncKey);
    const now = Date.now();
    
    if (lastSync && (now - parseInt(lastSync)) < CONFIG.DEBOUNCE_MS) {
      Logger.log('Debounce activo, ignorando edición');
      return;
    }
    
    props.setProperty(lastSyncKey, now.toString());
    
    // Programar sincronización con delay para agrupar cambios rápidos
    Utilities.sleep(CONFIG.DEBOUNCE_MS);
    
    // Enviar datos
    syncSheetToBackend(sheet, sheetName, isPublic, companyId, secretKey, webhookUrl);
    
  } catch (error) {
    Logger.log('Error en handleEdit: ' + error.toString());
  }
}

// ============================================================
// SINCRONIZACIÓN
// ============================================================

/**
 * Sincroniza los datos de una hoja al backend.
 * 
 * @param {Sheet} sheet - Hoja de cálculo
 * @param {string} sheetName - Nombre de la hoja
 * @param {boolean} isPublic - Si los datos son públicos
 * @param {string} companyId - ID de la empresa
 * @param {string} secretKey - Clave secreta
 * @param {string} webhookUrl - URL del webhook
 */
function syncSheetToBackend(sheet, sheetName, isPublic, companyId, secretKey, webhookUrl) {
  try {
    // Obtener todos los datos de la hoja
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    
    if (values.length < 2) {
      Logger.log('Hoja vacía o sin datos (solo headers)');
      return;
    }
    
    // Primera fila = headers
    const headers = values[0].map(h => String(h).trim());
    const rows = values.slice(1);
    
    // Convertir filas a objetos JSON
    const data = rows
      .filter(row => row.some(cell => cell !== '')) // Filtrar filas vacías
      .map((row, index) => {
        const obj = { _rowId: String(index + 2) }; // +2 porque índice 0 y headers
        headers.forEach((header, i) => {
          if (header) {
            obj[header] = row[i];
          }
        });
        return obj;
      });
    
    // Construir payload
    const payload = {
      company_id: companyId,
      sheet_name: sheetName,
      is_public: isPublic,
      data: data,
      metadata: {
        spreadsheet_id: SpreadsheetApp.getActive().getId(),
        spreadsheet_name: SpreadsheetApp.getActive().getName(),
        last_updated: new Date().toISOString(),
      },
    };
    
    // Enviar al backend
    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-optus-secret': secretKey,
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };
    
    const response = UrlFetchApp.fetch(webhookUrl, options);
    const statusCode = response.getResponseCode();
    const responseBody = response.getContentText();
    
    if (statusCode === 200) {
      Logger.log(`Sincronización exitosa: ${sheetName} (${data.length} registros)`);
      SpreadsheetApp.getActive().toast(
        `✅ ${data.length} registros sincronizados`,
        sheetName,
        3
      );
    } else {
      Logger.log(`Error en sincronización: HTTP ${statusCode} - ${responseBody}`);
      SpreadsheetApp.getActive().toast(
        `❌ Error: ${statusCode}`,
        sheetName,
        5
      );
    }
    
  } catch (error) {
    Logger.log('Error en syncSheetToBackend: ' + error.toString());
    SpreadsheetApp.getActive().toast(
      `❌ Error: ${error.message}`,
      'Error de Sincronización',
      5
    );
  }
}

/**
 * Sincroniza manualmente la hoja actual.
 * Puede ser invocado desde el menú o la UI.
 */
function syncCurrentSheet() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const sheetName = sheet.getName();
  const isPublic = !sheetName.startsWith('[PRIV]');
  
  const props = PropertiesService.getUserProperties();
  const companyId = props.getProperty(CONFIG.COMPANY_ID_KEY);
  const secretKey = props.getProperty(CONFIG.SECRET_KEY);
  const webhookUrl = props.getProperty(CONFIG.WEBHOOK_URL_KEY) || CONFIG.DEFAULT_WEBHOOK_URL;
  
  if (!companyId || !secretKey) {
    SpreadsheetApp.getUi().alert('⚠️ Por favor configure el Add-on primero');
    return;
  }
  
  syncSheetToBackend(sheet, sheetName, isPublic, companyId, secretKey, webhookUrl);
}

/**
 * Sincroniza todas las hojas del spreadsheet.
 */
function syncAllSheets() {
  const props = PropertiesService.getUserProperties();
  const companyId = props.getProperty(CONFIG.COMPANY_ID_KEY);
  const secretKey = props.getProperty(CONFIG.SECRET_KEY);
  const webhookUrl = props.getProperty(CONFIG.WEBHOOK_URL_KEY) || CONFIG.DEFAULT_WEBHOOK_URL;
  
  if (!companyId || !secretKey) {
    SpreadsheetApp.getUi().alert('⚠️ Por favor configure el Add-on primero');
    return;
  }
  
  const spreadsheet = SpreadsheetApp.getActive();
  const sheets = spreadsheet.getSheets();
  let synced = 0;
  
  sheets.forEach(sheet => {
    const sheetName = sheet.getName();
    const isPublic = !sheetName.startsWith('[PRIV]');
    syncSheetToBackend(sheet, sheetName, isPublic, companyId, secretKey, webhookUrl);
    synced++;
    Utilities.sleep(1000); // Pequeño delay entre hojas
  });
  
  SpreadsheetApp.getActive().toast(
    `✅ ${synced} hojas sincronizadas`,
    'Sincronización Completa',
    5
  );
}

// ============================================================
// UI CARDS
// ============================================================

/**
 * Crea la tarjeta de configuración inicial.
 */
function createConfigCard() {
  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('Configurar Optus Sync')
      .setImageUrl('https://www.gstatic.com/images/branding/product/2x/apps_script_48dp.png'))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph()
        .setText('Configure las credenciales para sincronizar datos con Optus BMS.'))
      .addWidget(CardService.newTextInput()
        .setFieldName('companyId')
        .setTitle('Company ID')
        .setHint('UUID de su empresa'))
      .addWidget(CardService.newTextInput()
        .setFieldName('secretKey')
        .setTitle('Secret Key')
        .setHint('Clave secreta del webhook'))
      .addWidget(CardService.newTextInput()
        .setFieldName('webhookUrl')
        .setTitle('Webhook URL (opcional)')
        .setHint('Dejar vacío para usar URL por defecto'))
      .addWidget(CardService.newButtonSet()
        .addButton(CardService.newTextButton()
          .setText('Guardar Configuración')
          .setOnClickAction(CardService.newAction()
            .setFunctionName('saveConfiguration')))));
  
  return card.build();
}

/**
 * Crea la tarjeta de estado (ya configurado).
 */
function createStatusCard() {
  const props = PropertiesService.getUserProperties();
  const companyId = props.getProperty(CONFIG.COMPANY_ID_KEY) || 'No configurado';
  const webhookUrl = props.getProperty(CONFIG.WEBHOOK_URL_KEY) || CONFIG.DEFAULT_WEBHOOK_URL;
  
  // Verificar si hay trigger instalado
  const triggers = ScriptApp.getProjectTriggers();
  const hasTrigger = triggers.some(t => t.getHandlerFunction() === 'handleEdit');
  
  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('Optus Sync')
      .setSubtitle('Estado de sincronización')
      .setImageUrl('https://www.gstatic.com/images/branding/product/2x/apps_script_48dp.png'))
    .addSection(CardService.newCardSection()
      .setHeader('Configuración')
      .addWidget(CardService.newDecoratedText()
        .setTopLabel('Company ID')
        .setText(companyId.substring(0, 8) + '...'))
      .addWidget(CardService.newDecoratedText()
        .setTopLabel('Webhook URL')
        .setText(webhookUrl.substring(0, 40) + '...'))
      .addWidget(CardService.newDecoratedText()
        .setTopLabel('Auto-Sync')
        .setText(hasTrigger ? '✅ Activo' : '⚪ Inactivo')))
    .addSection(CardService.newCardSection()
      .setHeader('Acciones')
      .addWidget(CardService.newButtonSet()
        .addButton(CardService.newTextButton()
          .setText('Sincronizar Hoja Actual')
          .setOnClickAction(CardService.newAction()
            .setFunctionName('syncCurrentSheet')))
        .addButton(CardService.newTextButton()
          .setText('Sincronizar Todo')
          .setOnClickAction(CardService.newAction()
            .setFunctionName('syncAllSheets'))))
      .addWidget(CardService.newButtonSet()
        .addButton(CardService.newTextButton()
          .setText(hasTrigger ? 'Desactivar Auto-Sync' : 'Activar Auto-Sync')
          .setOnClickAction(CardService.newAction()
            .setFunctionName(hasTrigger ? 'uninstallTriggerAction' : 'installTriggerAction')))))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextButton()
        .setText('⚙️ Reconfigurar')
        .setOnClickAction(CardService.newAction()
          .setFunctionName('showConfigCard'))));
  
  return card.build();
}

// ============================================================
// ACCIONES
// ============================================================

/**
 * Guarda la configuración desde el formulario.
 */
function saveConfiguration(e) {
  const props = PropertiesService.getUserProperties();
  const companyId = e.formInput.companyId;
  const secretKey = e.formInput.secretKey;
  const webhookUrl = e.formInput.webhookUrl;
  
  if (!companyId || !secretKey) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification()
        .setText('❌ Company ID y Secret Key son requeridos'))
      .build();
  }
  
  props.setProperty(CONFIG.COMPANY_ID_KEY, companyId);
  props.setProperty(CONFIG.SECRET_KEY, secretKey);
  
  if (webhookUrl) {
    props.setProperty(CONFIG.WEBHOOK_URL_KEY, webhookUrl);
  }
  
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification()
      .setText('✅ Configuración guardada'))
    .setNavigation(CardService.newNavigation()
      .updateCard(createStatusCard()))
    .build();
}

/**
 * Muestra la tarjeta de configuración.
 */
function showConfigCard(e) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation()
      .updateCard(createConfigCard()))
    .build();
}

/**
 * Instala trigger desde la UI.
 */
function installTriggerAction(e) {
  installTrigger();
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification()
      .setText('✅ Auto-sync activado'))
    .setNavigation(CardService.newNavigation()
      .updateCard(createStatusCard()))
    .build();
}

/**
 * Desinstala trigger desde la UI.
 */
function uninstallTriggerAction(e) {
  uninstallTrigger();
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification()
      .setText('🛑 Auto-sync desactivado'))
    .setNavigation(CardService.newNavigation()
      .updateCard(createStatusCard()))
    .build();
}
