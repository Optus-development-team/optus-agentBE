graph TD
    WA[Webhook WhatsApp] --> GlobalDisp[Global Dispatcher y Enrutador]
    
    %% Enrutamiento por Vertical y Rol
    GlobalDisp -- Cliente Academia --> AcadClient[Academy Client Orchestrator Singleton]
    GlobalDisp -- Admin Academia --> AcadAdmin[Academy Company Orchestrator Singleton]
    
    GlobalDisp -- Cliente Salon --> SalonClient[Salon Client Orchestrator Singleton]
    GlobalDisp -- Admin Salon --> SalonAdmin[Salon Company Orchestrator Singleton]
    
    subgraph Modulo Academia
        %% Subagentes del Cliente
        AcadClient --> SalesAcadC[Sales Agent Transient A]
        AcadClient --> ApptAcadC[Appt Client Agent Transient A]
        AcadClient --> InfoAcadC[Info Agent Transient A]
        
        %% Subagentes del Admin
        AcadAdmin --> ApptAcadA[Appt Admin Agent Transient A]
        AcadAdmin --> ReportAcad[Reporting Agent Transient A]
        AcadAdmin --> AcadAgt[Academic Admin Agent Exclusivo]
    end
    
    subgraph Modulo Salon de Belleza
        %% Subagentes del Cliente
        SalonClient --> SalesSalonC[Sales Agent Transient B]
        SalonClient --> ApptSalonC[Appt Client Agent Transient B]
        SalonClient --> InfoSalonC[Info Agent Transient B]
        
        %% Subagentes del Admin
        SalonAdmin --> ApptSalonA[Appt Admin Agent Transient B]
        SalonAdmin --> ReportSalon[Reporting Agent Transient B]
        SalonAdmin --> StylistAgt[Stylist Admin Agent Exclusivo]
    end

    subgraph Capa de Herramientas Logicas
        SharedTools[Tools Compartidas Core Ventas Agenda Reportes]
        SpecializedTools[Tools Especializadas Verticales]
        RAGTools[Tools de Busqueda RAG]
    end

    %% Conexiones a Herramientas
    SalesAcadC -.-> SharedTools
    SalesSalonC -.-> SharedTools
    ApptAcadC -.-> SharedTools
    ApptSalonC -.-> SharedTools
    ApptAcadA -.-> SharedTools
    ApptSalonA -.-> SharedTools
    ReportAcad -.-> SharedTools
    ReportSalon -.-> SharedTools
    
    AcadAgt -.-> SpecializedTools
    StylistAgt -.-> SpecializedTools
    
    InfoAcadC -.-> RAGTools
    InfoSalonC -.-> RAGTools

    subgraph Supabase Single Database Shared Schema
        RLS[Row Level Security RLS Company ID]
        
        RLS --- CoreDB[Tablas Core Multi Tenant]
        RLS --- VerticalDB[Tablas Verticales Especializadas]
        RLS --- RAGDB[Tablas Dinamicas tsvector RAG]
    end

    SharedTools --> RLS
    SpecializedTools --> RLS
    RAGTools --> RLS