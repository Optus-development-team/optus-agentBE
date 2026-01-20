/**
 * Funciones auxiliares para el Sidebar del Add-on.
 * Expuestas para comunicación con el HTML.
 */

/**
 * Obtiene la configuración existente para el sidebar.
 */
function getExistingConfig() {
  const props = PropertiesService.getUserProperties();
  const triggers = ScriptApp.getProjectTriggers();
  const hasAutoSync = triggers.some(t => t.getHandlerFunction() === 'handleEdit');
  
  return {
    companyId: props.getProperty(CONFIG.COMPANY_ID_KEY) || '',
    webhookUrl: props.getProperty(CONFIG.WEBHOOK_URL_KEY) || '',
    hasAutoSync: hasAutoSync
  };
}

/**
 * Guarda la configuración desde el sidebar.
 */
function saveConfigFromSidebar(config) {
  const props = PropertiesService.getUserProperties();
  
  if (!config.companyId || !config.secretKey) {
    throw new Error('Company ID y Secret Key son requeridos');
  }
  
  props.setProperty(CONFIG.COMPANY_ID_KEY, config.companyId);
  props.setProperty(CONFIG.SECRET_KEY, config.secretKey);
  
  if (config.webhookUrl) {
    props.setProperty(CONFIG.WEBHOOK_URL_KEY, config.webhookUrl);
  } else {
    props.deleteProperty(CONFIG.WEBHOOK_URL_KEY);
  }
  
  return true;
}

/**
 * Alterna el estado de auto-sync desde el sidebar.
 */
function toggleAutoSyncFromSidebar(enable) {
  if (enable) {
    installTrigger();
  } else {
    uninstallTrigger();
  }
  return enable;
}

/**
 * Abre el sidebar de configuración.
 */
function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('Optus Sheets Sync')
    .setWidth(320);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Crea el menú personalizado al abrir el spreadsheet.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('⚡ Optus Sync')
    .addItem('📋 Configurar', 'showSidebar')
    .addSeparator()
    .addItem('🔄 Sincronizar hoja actual', 'syncCurrentSheet')
    .addItem('🔄 Sincronizar todas las hojas', 'syncAllSheets')
    .addSeparator()
    .addItem('✅ Activar auto-sync', 'installTrigger')
    .addItem('🛑 Desactivar auto-sync', 'uninstallTrigger')
    .addToUi();
}
