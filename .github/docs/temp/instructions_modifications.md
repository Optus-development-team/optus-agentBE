# 📋 Prompt: Implementación de Sincronización Google Sheets -> Supabase (Universal Schema) con Workspace Add-on

**Contexto:**
Estamos actualizando el backend `OPTUSBMS_BACKEND` (NestJS + Supabase) para soportar una arquitectura Multi-tenant flexible. Necesitamos permitir que las empresas definan su propia estructura de datos (Horarios, Menús, Inventarios) usando **Google Sheets** como CMS. El backend debe sincronizar estos datos a una estructura genérica en Postgres usando JSONB y un Google Workspace Add-on que notifique los cambios.

**Objetivo:**

1. Implementar el esquema `Entity-Attribute-Value` modernizado (JSONB) en Supabase.
2. Crear un **Google Workspace Add-on** que envíe **TODOS** los datos (Públicos y Privados) a un Webhook en NestJS.
3. Asegurar que la privacidad se maneje en la capa de consulta (Agent Tool), impidiendo que el Agente lea datos marcados como privados, aunque existan en la base de datos.
4. Migrar datos heredados a esta nueva estructura.

---

## 1. Modificaciones de Base de Datos (Supabase/PostgreSQL)

Necesitamos crear dos tablas genéricas para manejar datos dinámicos.

**Instrucción Crítica:** Utiliza el **MCP de Supabase** para ejecutar las migraciones, inspeccionar el esquema actual y realizar las inserciones de datos.

### 1.1 Migración de Esquema

Ejecuta el siguiente SQL para crear la estructura:

```sql
-- TABLA 1: Definiciones de Entidad (Metadatos)
CREATE TABLE public.entity_definitions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_name text NOT NULL, -- Ej: "Horarios", "[PRIV] Costos"
  schema_sample jsonb DEFAULT '{}'::jsonb, 
  is_public_default boolean DEFAULT true, -- Flag crítico para el filtro del Agente
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, entity_name)
);

-- TABLA 2: Registros Dinámicos (Datos Reales)
CREATE TABLE public.dynamic_records (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_definition_id uuid NOT NULL REFERENCES public.entity_definitions(id) ON DELETE CASCADE,
  external_row_id text, -- ID opcional para sincronización
  data jsonb NOT NULL, -- Contenido: {"dia": "Lunes", "hora": "9am"}
  search_text tsvector, 
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ÍNDICES
CREATE INDEX idx_dynamic_records_data ON public.dynamic_records USING gin (data);
CREATE INDEX idx_dynamic_records_lookup ON public.dynamic_records (company_id, entity_definition_id);

```

### 1.2 Documentación

* Actualiza el diagrama `DBML DATABASE_SCHEMA.dbml` para reflejar estas dos nuevas tablas.
* Actualiza `DATABASE.md` en `.github/docs` explicando el patrón "Universal Schema".

### 1.3 Migración de Datos Legacy

Tienes archivos SQL con datos antiguos en `.github/docs/temp/data`.
**Instrucción:** Usando el MCP, lee estos archivos e inserta los datos en la nueva estructura `dynamic_records`:

1. Crea la `company` "Academia Pre-Militar" (si no existe).
2. Crea los `entity_definitions` correspondientes.
3. Convierte las filas `INSERT` de los archivos SQL antiguos en objetos JSON y guárdalos en `dynamic_records`.

---

## 2. Nuevo Módulo en NestJS: `SheetsSyncModule`

Crea un módulo para recibir los webhooks del Add-on.

### A. Controlador (`sheets-sync.controller.ts`)

Endpoint `POST /v1/webhooks/sheets/sync`.

* **Payload Esperado:**

```json
{
  "company_id": "...",
  "sheet_name": "[PRIV] Costos Internos",
  "is_public": false,  // Calculado por el Add-on basado en el nombre
  "data": [...]
}

```

* **Seguridad:** Valida el header `x-optus-secret`.

### B. Servicio (`sheets-sync.service.ts`)

* **Lógica de Upsert con Privacidad:**
1. Buscar la definición en `entity_definitions` basada en `sheet_name`.
2. **Actualizar o Crear** la definición asegurando guardar el valor de `is_public_default` recibido en el payload.
* *Importante:* Si el payload dice `is_public: false`, se debe actualizar la definición en DB para que futuras consultas del Agente bloqueen estos datos.


3. **Wipe & Replace:** Borra los registros antiguos de ese `entity_definition_id` e inserta los nuevos del array `data`.



---

## 3. Google Workspace Add-on (Estructura del Proyecto)

Genera la estructura de archivos en `/google-addon`:

### A. Manifiesto (`appsscript.json`)

Incluye permisos para `script.external_request`, `spreadsheets.currentonly` y `script.container.ui`.

### B. Lógica Principal (`Code.gs`)

Debe implementar:

1. `installTrigger()`: Crear programáticamente el trigger `onEdit`.
2. `handleEdit(e)`:
* **Lógica de Privacidad (Cambio Crítico):**
* Calcular: `const isPublic = !sheetName.startsWith('[PRIV]');`
* **IMPORTANTE:** NO detener la ejecución si es privado. Se deben enviar los datos igualmente para propósitos administrativos, pero enviando el flag `is_public: false`.


* Leer `PropertiesService` (Credenciales).
* Construir Payload incluyendo `is_public`.
* Enviar a NestJS con `UrlFetchApp`.



### C. UI de Configuración (`Sidebar.html`)

Formulario para ingresar `Company ID` y `Secret Key`.

---

## 4. Actualización del Agente IA (Google ADK Tools)

Actualiza la definición de herramientas del agente para **filtrar datos privados**.

**Nueva Tool:** `query_knowledge_base`

* **Descripción:** "Busca información específica de la empresa (Horarios, Precios, Inventarios)."
* **Parámetros:** `category` (string), `search_term` (string).

**Lógica Backend (Filtro de Seguridad):**

1. Buscar `entity_definition_id` via `ILIKE` en `entity_name`.
2. **Query Segura:** Ejecutar un JOIN para filtrar datos privados explícitamente.

```sql
SELECT dr.data
FROM dynamic_records dr
JOIN entity_definitions ed ON dr.entity_definition_id = ed.id
WHERE ed.id = found_id
AND ed.is_public_default = true  -- <-- FILTRO CRÍTICO: Solo datos públicos
AND dr.data::text ILIKE '%' || search_term || '%'
LIMIT 10;

```

*Nota: Esto asegura que el Agente nunca vea datos marcados como privados, aunque existan en la BD.*

---

## 5. Checklist de Seguridad & Validaciones

* [ ] **RLS:** Activar Row Level Security en `dynamic_records`.
* [ ] **Filtro de Agente:** Verificar que la query SQL de la Tool `query_knowledge_base` tenga explícitamente `AND is_public_default = true`.
* [ ] **Add-on:** Verificar que el Add-on envíe correctamente el flag `is_public = false` cuando la hoja empieza con `[PRIV]`, pero que **SÍ envíe los datos**.
* [ ] **Validación:** En el Controller, asegurar que el JSON recibido sea válido.