const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
  ExternalHyperlink, TableOfContents
} = require('docx');
const fs = require('fs');

const hoy = '18 de junio de 2026';
const navy = '1A3A5C';
const teal = '0D7377';
const lightBlue = 'E8F4F8';
const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: border, bottom: border, left: border, right: border };
const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: teal, space: 6 } },
    children: [new TextRun({ text, bold: true, size: 28, color: navy, font: 'Arial' })]
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, size: 24, color: teal, font: 'Arial' })]
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 120 },
    children: [new TextRun({ text, size: 22, font: 'Arial', ...opts })]
  });
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, size: 22, font: 'Arial' })]
  });
}

function numbered(text) {
  return new Paragraph({
    numbering: { reference: 'numbers', level: 0 },
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, size: 22, font: 'Arial' })]
  });
}

function gap(size = 160) {
  return new Paragraph({ spacing: { before: size, after: 0 }, children: [new TextRun('')] });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function infoBox(label, value) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2600, 6760],
    rows: [new TableRow({
      children: [
        new TableCell({
          borders,
          width: { size: 2600, type: WidthType.DXA },
          shading: { fill: lightBlue, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 160, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, font: 'Arial', color: navy })] })]
        }),
        new TableCell({
          borders,
          width: { size: 6760, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 160, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: value, size: 20, font: 'Arial' })] })]
        })
      ]
    })]
  });
}

function sectionBox(lines) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [new TableRow({
      children: [new TableCell({
        borders: { top: { style: BorderStyle.SINGLE, size: 4, color: teal }, bottom: { style: BorderStyle.SINGLE, size: 4, color: teal }, left: { style: BorderStyle.SINGLE, size: 4, color: teal }, right: { style: BorderStyle.SINGLE, size: 4, color: teal } },
        shading: { fill: 'F0F8F8', type: ShadingType.CLEAR },
        margins: { top: 160, bottom: 160, left: 240, right: 240 },
        children: lines.map(l => new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: l, size: 21, font: 'Arial' })] }))
      })]
    })]
  });
}

const doc = new Document({
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
      },
      {
        reference: 'numbers',
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
      }
    ]
  },
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: 'Arial', color: navy },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial', color: teal },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 } },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1260, bottom: 1440, left: 1260 }
      }
    },
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: teal, space: 6 } },
            spacing: { after: 120 },
            children: [
              new TextRun({ text: 'Branca App  |  AFG Ingenieria', size: 18, font: 'Arial', color: '888888' }),
              new TextRun({ text: '  —  Documento de Servicio y Uso', size: 18, font: 'Arial', color: 'AAAAAA' })
            ]
          })
        ]
      })
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC', space: 6 } },
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'Pagina ', size: 18, font: 'Arial', color: '888888' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 18, font: 'Arial', color: '888888' }),
              new TextRun({ text: ' de ', size: 18, font: 'Arial', color: '888888' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, font: 'Arial', color: '888888' }),
              new TextRun({ text: '   |   Confidencial', size: 18, font: 'Arial', color: 'AAAAAA' })
            ]
          })
        ]
      })
    },
    children: [

      // ── PORTADA ──────────────────────────────────────────────────
      gap(800),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
        children: [new TextRun({ text: 'INGENIERIA BRANCA SRL', bold: true, size: 48, font: 'Arial', color: navy })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 400 },
        children: [new TextRun({ text: 'Sistema de Gestion de Ordenes de Servicio', size: 28, font: 'Arial', color: '444444' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: teal, space: 8 }, top: { style: BorderStyle.SINGLE, size: 6, color: teal, space: 8 } },
        spacing: { before: 200, after: 200 },
        children: [new TextRun({ text: 'CONTRATO DE SERVICIO, USO Y MANTENIMIENTO', bold: true, size: 32, font: 'Arial', color: teal })]
      }),
      gap(400),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'Version 1.0', size: 24, font: 'Arial', color: '666666' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80, after: 0 },
        children: [new TextRun({ text: hoy, size: 22, font: 'Arial', color: '888888' })]
      }),
      gap(600),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [4680, 4680],
        rows: [new TableRow({ children: [
          new TableCell({
            borders,
            width: { size: 4680, type: WidthType.DXA },
            shading: { fill: lightBlue, type: ShadingType.CLEAR },
            margins: { top: 160, bottom: 160, left: 200, right: 200 },
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'PROVEEDOR', bold: true, size: 20, font: 'Arial', color: navy })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'AFG Ingenieria', size: 22, font: 'Arial', bold: true })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Desarrollo de Software', size: 20, font: 'Arial', color: '555555' })] }),
            ]
          }),
          new TableCell({
            borders,
            width: { size: 4680, type: WidthType.DXA },
            shading: { fill: 'F0F8F0', type: ShadingType.CLEAR },
            margins: { top: 160, bottom: 160, left: 200, right: 200 },
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'CLIENTE', bold: true, size: 20, font: 'Arial', color: navy })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Ingenieria Branca SRL', size: 22, font: 'Arial', bold: true })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Servicios de Mantenimiento Industrial', size: 20, font: 'Arial', color: '555555' })] }),
            ]
          })
        ]})]
      }),

      pageBreak(),

      // ── INDICE ───────────────────────────────────────────────────
      h1('Indice de Contenidos'),
      new TableOfContents('Indice', { hyperlink: true, headingStyleRange: '1-2' }),

      pageBreak(),

      // ── 1. DESCRIPCION ──────────────────────────────────────────
      h1('1. Descripcion del Sistema'),
      p('Branca App es una aplicacion web progresiva (PWA) desarrollada por AFG Ingenieria para Ingenieria Branca SRL. El sistema permite la gestion integral de ordenes de servicio tecnico, incluyendo la creacion, seguimiento, cierre y facturacion de cada intervencion.'),
      gap(),
      h2('1.1 Funcionalidades principales'),
      bullet('Creacion y gestion de ordenes de servicio (abiertas, pendientes y cerradas)'),
      bullet('Planificacion de visitas con calendario mensual y arrastre de fechas'),
      bullet('Asignacion de responsables tecnicos con firma digital'),
      bullet('Historial de estados y trazabilidad de cada orden'),
      bullet('Gestion de clientes y base de datos de empresas'),
      bullet('Facturacion y generacion de comprobantes'),
      bullet('Sincronizacion en tiempo real entre multiples dispositivos via Firebase'),
      bullet('Acceso desde cualquier dispositivo: celular, tablet o computadora'),
      bullet('Instalable como app (sin necesidad de tienda de aplicaciones)'),
      gap(),
      h2('1.2 Roles de usuario'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2000, 3680, 3680],
        rows: [
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 2000, type: WidthType.DXA }, shading: { fill: navy, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Rol', bold: true, color: 'FFFFFF', size: 20, font: 'Arial' })] })] }),
            new TableCell({ borders, width: { size: 3680, type: WidthType.DXA }, shading: { fill: navy, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Acceso', bold: true, color: 'FFFFFF', size: 20, font: 'Arial' })] })] }),
            new TableCell({ borders, width: { size: 3680, type: WidthType.DXA }, shading: { fill: navy, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Descripcion', bold: true, color: 'FFFFFF', size: 20, font: 'Arial' })] })] }),
          ]}),
          ...[ ['Administrador', 'Total', 'Acceso completo: ordenes, clientes, usuarios, configuracion, planificacion y facturacion.'],
               ['Tecnico', 'Parcial', 'Crea y gestiona sus propias ordenes. Ve las planificadas que le asignan.'],
               ['Facturacion', 'Facturacion', 'Acceso exclusivo al modulo de facturacion y comprobantes.']
          ].map((r, i) => new TableRow({ children: r.map((txt, ci) => new TableCell({
            borders,
            width: { size: [2000,3680,3680][ci], type: WidthType.DXA },
            shading: { fill: i % 2 === 0 ? 'FFFFFF' : lightBlue, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: txt, size: 20, font: 'Arial' })] })]
          })) }))
        ]
      }),

      pageBreak(),

      // ── 2. CONTRATO DE USO ──────────────────────────────────────
      h1('2. Contrato de Licencia y Uso'),
      p('El presente contrato establece los terminos y condiciones bajo los cuales Ingenieria Branca SRL (en adelante "el Cliente") accede y utiliza el sistema Branca App, desarrollado y mantenido por AFG Ingenieria (en adelante "el Proveedor").'),
      gap(),
      h2('2.1 Licencia otorgada'),
      p('El Proveedor otorga al Cliente una licencia de uso no exclusiva, no transferible e intransferible del sistema, limitada al uso interno de la empresa para la gestion de sus operaciones de servicio tecnico.'),
      gap(),
      h2('2.2 Restricciones de uso'),
      numbered('Queda prohibida la reproduccion, copia o distribucion del sistema o su codigo fuente a terceros sin autorizacion escrita del Proveedor.'),
      numbered('El Cliente no podra sublicenciar, vender, alquilar ni ceder el acceso al sistema.'),
      numbered('No esta permitido realizar ingenieria inversa, descompilar o modificar el sistema sin consentimiento expreso.'),
      numbered('El sistema es de uso exclusivo de Ingenieria Branca SRL y su personal autorizado.'),
      gap(),
      h2('2.3 Propiedad intelectual'),
      p('El codigo fuente, diseno, logica de negocio, estructura de datos y todos los componentes del sistema son propiedad intelectual de AFG Ingenieria. El Cliente es propietario de los datos ingresados en el sistema (ordenes, clientes, tecnicos, etc.).'),
      gap(),
      h2('2.4 Vigencia'),
      p('Este contrato entra en vigor a partir de la fecha de entrega del sistema y se mantiene activo mientras exista una relacion de servicio activa entre las partes. Cualquiera de las partes puede rescindir con 30 dias de aviso previo por escrito.'),
      gap(),
      h2('2.5 Responsabilidades del Cliente'),
      bullet('Mantener confidenciales las credenciales de acceso de cada usuario.'),
      bullet('Notificar al Proveedor ante cualquier uso no autorizado detectado.'),
      bullet('Utilizar el sistema conforme a su finalidad operativa.'),
      bullet('Designar un responsable interno para la coordinacion con el Proveedor.'),

      pageBreak(),

      // ── 3. CONFIDENCIALIDAD ─────────────────────────────────────
      h1('3. Confidencialidad de la Informacion'),
      h2('3.1 Informacion confidencial'),
      p('Se considera informacion confidencial todo dato almacenado o procesado por el sistema, incluyendo:'),
      bullet('Datos de clientes: nombre, CUIT, contacto, ubicacion, email y telefono.'),
      bullet('Ordenes de servicio: descripcion tecnica, diagnostico, acciones realizadas y comprobantes.'),
      bullet('Datos de usuarios: nombre, usuario, contrasena y firma digital.'),
      bullet('Informacion comercial: precios, condiciones de facturacion y relaciones con clientes.'),
      gap(),
      h2('3.2 Compromisos del Proveedor'),
      bullet('AFG Ingenieria no compartira, vende ni divulgara la informacion del Cliente a terceros bajo ningun concepto.'),
      bullet('El acceso tecnico al sistema por parte del Proveedor se realizara unicamente con autorizacion del Cliente y con fines de mantenimiento o soporte.'),
      bullet('Los datos almacenados en Firebase (Google Cloud) se rigen por las politicas de privacidad de Google, bajo cifrado en transito (HTTPS) y en reposo.'),
      gap(),
      h2('3.3 Seguridad del acceso'),
      bullet('Cada usuario cuenta con credenciales individuales (usuario y contrasena).'),
      bullet('El administrador es el unico con acceso completo al sistema y a la gestion de usuarios.'),
      bullet('Las contrasenas se almacenan en la base de datos Firebase bajo acceso restringido por reglas de seguridad.'),
      bullet('Se recomienda al Cliente cambiar las contrasenas iniciales y no compartirlas entre usuarios.'),
      gap(),
      sectionBox([
        'IMPORTANTE: El Cliente es responsable del uso que haga de las credenciales asignadas.',
        'En caso de perdida o comprometimiento de una contrasena, debe notificarse',
        'inmediatamente al administrador para su restablecimiento.'
      ]),

      pageBreak(),

      // ── 4. MANUAL DE USO ────────────────────────────────────────
      h1('4. Manual de Uso del Sistema'),
      h2('4.1 Acceso al sistema'),
      p('El sistema es accesible desde cualquier navegador moderno a traves de la URL provista. Tambien puede instalarse como aplicacion en el celular o computadora para acceso rapido sin necesidad de abrir el navegador.'),
      gap(),
      infoBox('URL de acceso', 'https://jvsystems.com.ar/branca/'),
      gap(160),
      infoBox('Dispositivos compatibles', 'Celular, tablet y computadora (Android, iOS, Windows, Mac)'),
      gap(160),
      infoBox('Navegadores recomendados', 'Google Chrome, Safari, Microsoft Edge'),
      gap(),
      h2('4.2 Flujo de trabajo de una orden'),
      numbered('El tecnico o administrador crea una nueva orden desde el boton "+ Nueva".'),
      numbered('Se selecciona la empresa cliente desde la base de datos o se ingresa una nueva.'),
      numbered('Se completan los datos del equipo (marca, modelo, numero de serie).'),
      numbered('Se registra el diagnostico, causa raiz y acciones realizadas.'),
      numbered('Se registran los tiempos de intervencion y firma del tecnico y cliente.'),
      numbered('Se cierra la orden, quedando disponible para facturacion.'),
      gap(),
      h2('4.3 Planificacion de visitas'),
      p('El modulo de Planificacion permite crear ordenes futuras en un calendario mensual. Los administradores pueden arrastrar las visitas entre dias y asignarlas a distintos tecnicos. Las ordenes planificadas aparecen en la lista principal del tecnico asignado.'),
      gap(),
      h2('4.4 Sincronizacion entre dispositivos'),
      p('Todos los datos se sincronizan automaticamente con Firebase en tiempo real. Si un usuario ingresa datos en un dispositivo, los demas dispositivos los veran al refrescar. En caso de falta de conexion, los datos se guardan localmente y se sincronizan al recuperar la conexion.'),

      pageBreak(),

      // ── 5. ACTUALIZACIONES ──────────────────────────────────────
      h1('5. Actualizaciones y Nuevas Versiones'),
      h2('5.1 Politica de actualizaciones'),
      p('El Proveedor liberara actualizaciones del sistema de manera continua, clasificadas segun su naturaleza:'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2400, 2760, 4200],
        rows: [
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, shading: { fill: navy, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Tipo', bold: true, color: 'FFFFFF', size: 20, font: 'Arial' })] })] }),
            new TableCell({ borders, width: { size: 2760, type: WidthType.DXA }, shading: { fill: navy, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Ejemplo', bold: true, color: 'FFFFFF', size: 20, font: 'Arial' })] })] }),
            new TableCell({ borders, width: { size: 4200, type: WidthType.DXA }, shading: { fill: navy, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Proceso', bold: true, color: 'FFFFFF', size: 20, font: 'Arial' })] })] }),
          ]}),
          ...[ ['Correctivas', 'Errores / bugs', 'Se aplican inmediatamente sin costo adicional.'],
               ['Mejoras menores', 'Ajustes de UI, nuevos campos', 'Se coordinan en el ciclo mensual.'],
               ['Nuevas funcionalidades', 'Modulos nuevos', 'Se presupuestan y acuerdan con el Cliente.'],
          ].map((r, i) => new TableRow({ children: r.map((txt, ci) => new TableCell({
            borders,
            width: { size: [2400,2760,4200][ci], type: WidthType.DXA },
            shading: { fill: i % 2 === 0 ? 'FFFFFF' : lightBlue, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: txt, size: 20, font: 'Arial' })] })]
          })) }))
        ]
      }),
      gap(),
      h2('5.2 Aplicacion de actualizaciones'),
      p('Al ser una aplicacion web, las actualizaciones se aplican automaticamente del lado del servidor. El usuario solo debe refrescar el navegador (o limpiar el cache con Ctrl+Shift+R) para obtener la version mas reciente. No se requiere ninguna instalacion manual.'),
      gap(),
      h2('5.3 Versionado'),
      p('Cada version estable se marca con un tag en el repositorio de codigo (ej. v1.0, v1.1). Esto permite revertir a una version anterior en caso de necesidad. El historial completo de versiones es accesible en GitHub.'),
      infoBox('Repositorio', 'https://github.com/JV-System/jvsystems/tree/master/branca'),
      gap(160),
      infoBox('Version actual', 'v1.0 - 18/06/2026'),

      pageBreak(),

      // ── 6. MANTENIMIENTO ────────────────────────────────────────
      h1('6. Plan de Mantenimiento Mensual'),
      p('El Proveedor ofrece un plan de mantenimiento mensual que incluye las siguientes actividades:'),
      gap(),
      h2('6.1 Actividades incluidas'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [4680, 4680],
        rows: [
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 4680, type: WidthType.DXA }, shading: { fill: navy, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Actividad', bold: true, color: 'FFFFFF', size: 20, font: 'Arial' })] })] }),
            new TableCell({ borders, width: { size: 4680, type: WidthType.DXA }, shading: { fill: navy, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Frecuencia', bold: true, color: 'FFFFFF', size: 20, font: 'Arial' })] })] }),
          ]}),
          ...[ ['Revision del funcionamiento general del sistema', 'Mensual'],
               ['Verificacion de sincronizacion con Firebase', 'Mensual'],
               ['Correccion de errores reportados por el Cliente', 'Bajo demanda (sin costo)'],
               ['Revision de logs y errores en consola', 'Mensual'],
               ['Actualizacion de dependencias de seguridad', 'Trimestral'],
               ['Verificacion del backup automatico de Firebase', 'Mensual'],
               ['Reunion de seguimiento con el Cliente', 'Mensual / a coordinar'],
               ['Soporte via WhatsApp o email', 'Lunes a viernes, 9 a 18 hs'],
          ].map((r, i) => new TableRow({ children: r.map((txt, ci) => new TableCell({
            borders,
            width: { size: 4680, type: WidthType.DXA },
            shading: { fill: i % 2 === 0 ? 'FFFFFF' : lightBlue, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: txt, size: 20, font: 'Arial' })] })]
          })) }))
        ]
      }),
      gap(),
      h2('6.2 Tiempos de respuesta'),
      bullet('Errores criticos (sistema inaccesible): respuesta en menos de 4 horas habiles.'),
      bullet('Errores que afectan funcionalidad principal: resolucion en 24 horas habiles.'),
      bullet('Mejoras o ajustes menores: coordinacion en el ciclo mensual.'),
      gap(),
      h2('6.3 Canales de contacto'),
      infoBox('Email', 'afg.ingenieria.soft@gmail.com'),
      gap(100),
      infoBox('Horario de soporte', 'Lunes a viernes de 9:00 a 18:00 hs (Argentina)'),

      pageBreak(),

      // ── 7. CAMBIOS ──────────────────────────────────────────────
      h1('7. Proceso de Solicitud de Cambios'),
      h2('7.1 Como solicitar un cambio'),
      p('El Cliente puede solicitar cambios o nuevas funcionalidades al sistema en cualquier momento. El proceso es el siguiente:'),
      numbered('El Cliente describe el cambio solicitado por email o en la reunion mensual.'),
      numbered('El Proveedor analiza el impacto tecnico y el tiempo estimado de desarrollo.'),
      numbered('Se presenta una propuesta de presupuesto si corresponde (cambios mayores).'),
      numbered('Una vez aprobado, el cambio se agenda y se implementa en el siguiente ciclo.'),
      numbered('Se notifica al Cliente cuando el cambio esta disponible en produccion.'),
      gap(),
      h2('7.2 Cambios incluidos sin costo'),
      bullet('Correcciones de errores o comportamientos inesperados del sistema.'),
      bullet('Ajustes menores de interfaz o textos.'),
      bullet('Cambios en validaciones o flujos que no impliquen logica nueva.'),
      bullet('Modificacion de usuarios, permisos o configuraciones del sistema.'),
      gap(),
      h2('7.3 Cambios presupuestables'),
      bullet('Nuevos modulos o secciones del sistema.'),
      bullet('Integraciones con sistemas externos (facturacion electronica, AFIP, etc.).'),
      bullet('Reportes o exportaciones de datos complejos.'),
      bullet('Cambios estructurales en la base de datos.'),
      gap(),
      sectionBox([
        'Todo cambio aprobado queda documentado y versionado en el repositorio.',
        'Esto garantiza trazabilidad completa y la posibilidad de revertir si fuera necesario.'
      ]),

      pageBreak(),

      // ── 8. CUIDADOS DE DATOS ────────────────────────────────────
      h1('8. Cuidados y Calidad de los Datos'),
      h2('8.1 Responsabilidad de la informacion'),
      p('El Cliente es responsable de la veracidad y calidad de los datos ingresados al sistema. El Proveedor no puede validar la exactitud de la informacion de clientes, equipos u ordenes cargadas por los usuarios.'),
      gap(),
      h2('8.2 Buenas practicas recomendadas'),
      bullet('Ingresar los datos del cliente de forma completa (CUIT, contacto, ubicacion) desde el primer uso, para facilitar la facturacion y el seguimiento.'),
      bullet('Asignar siempre un tecnico responsable a cada orden antes de cerrarla.'),
      bullet('Completar el diagnostico y las acciones realizadas con el mayor detalle posible.'),
      bullet('Cerrar las ordenes finalizadas para que no queden como pendientes indefinidamente.'),
      bullet('No usar datos de prueba en el sistema de produccion.'),
      bullet('Cambiar las contrasenas iniciales por contrasenas seguras.'),
      gap(),
      h2('8.3 Limpieza periodica de datos'),
      p('Se recomienda revisar periodicamente las ordenes y clientes para:'),
      bullet('Eliminar ordenes de prueba o duplicadas.'),
      bullet('Actualizar los datos de contacto de los clientes.'),
      bullet('Verificar que los tecnicos activos esten correctamente cargados.'),
      gap(),
      h2('8.4 Borrado de datos'),
      p('El borrado de datos es una accion irreversible. Solo el administrador puede eliminar ordenes y clientes. Para operaciones masivas (borrar toda la base), se debe acceder directamente a la consola de Firebase. Se recomienda siempre hacer un backup antes de cualquier borrado masivo.'),

      pageBreak(),

      // ── 9. BACKUP ───────────────────────────────────────────────
      h1('9. Politica de Backup e Informacion'),
      h2('9.1 Almacenamiento de datos'),
      p('Todos los datos del sistema se almacenan en Firebase Realtime Database de Google Cloud, con infraestructura ubicada en Estados Unidos (us-central1). Google garantiza alta disponibilidad, redundancia geografica y cifrado de datos en reposo y en transito.'),
      gap(),
      h2('9.2 Backup automatico'),
      p('Firebase Realtime Database incluye la posibilidad de configurar backups diarios automaticos hacia Google Cloud Storage (requiere plan Blaze de Firebase). Se recomienda al Cliente activar esta opcion para garantizar la recuperacion ante cualquier eventualidad.'),
      gap(),
      infoBox('Frecuencia recomendada', 'Diaria (backup automatico de Firebase)'),
      gap(100),
      infoBox('Retencion', '30 dias de historico de backups'),
      gap(100),
      infoBox('Ubicacion', 'Google Cloud Storage (mismo proyecto Firebase)'),
      gap(),
      h2('9.3 Backup manual'),
      p('En cualquier momento, el administrador puede exportar toda la base de datos manualmente desde la consola de Firebase:'),
      numbered('Ingresar a console.firebase.google.com'),
      numbered('Seleccionar el proyecto "branca-ingenieria".'),
      numbered('Ir a Realtime Database > icono de opciones (tres puntos) > Exportar JSON.'),
      numbered('Guardar el archivo descargado en un lugar seguro.'),
      gap(),
      h2('9.4 Recuperacion de datos'),
      p('En caso de perdida de datos, el Proveedor puede asistir en la restauracion a partir de un backup previo. El tiempo de recuperacion dependera del backup disponible mas reciente. Para datos eliminados sin backup, la recuperacion no es posible.'),
      gap(),
      sectionBox([
        'RECOMENDACION: Activar el backup automatico diario en Firebase (plan Blaze).',
        'El costo estimado es inferior a USD 1 por mes para el volumen de datos de este sistema.',
        'Contactar a AFG Ingenieria para asistencia en la configuracion.'
      ]),
      gap(),
      h2('9.5 Retencion de datos'),
      p('Los datos se conservan en Firebase indefinidamente hasta que el Cliente los elimine. No existe eliminacion automatica. Las ordenes cerradas permanecen en el historial y son accesibles en todo momento desde el modulo de Historial.'),

      pageBreak(),

      // ── 10. FIRMAS ──────────────────────────────────────────────
      h1('10. Firmas y Acuerdo'),
      p('Las partes declaran haber leido, comprendido y aceptado los terminos del presente documento.'),
      gap(400),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [4400, 560, 4400],
        rows: [new TableRow({ children: [
          new TableCell({
            borders: noBorders,
            width: { size: 4400, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 0, right: 0 },
            children: [
              new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 2, color: '333333', space: 4 } }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'AFG Ingenieria', bold: true, size: 20, font: 'Arial' })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Proveedor del Sistema', size: 18, font: 'Arial', color: '555555' })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: hoy, size: 18, font: 'Arial', color: '888888' })] }),
            ]
          }),
          new TableCell({ borders: noBorders, width: { size: 560, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun('')] })] }),
          new TableCell({
            borders: noBorders,
            width: { size: 4400, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 0, right: 0 },
            children: [
              new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 2, color: '333333', space: 4 } }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Ingenieria Branca SRL', bold: true, size: 20, font: 'Arial' })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Cliente', size: 18, font: 'Arial', color: '555555' })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: hoy, size: 18, font: 'Arial', color: '888888' })] }),
            ]
          }),
        ]})]
      }),

    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  const out = 'C:\\Users\\AFG Ingeniería\\Desktop\\Branca_Contrato_Servicio_v1.0.docx';
  fs.writeFileSync(out, buffer);
  console.log('OK: ' + out);
}).catch(e => { console.error('ERROR:', e.message); });
