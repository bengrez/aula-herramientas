/* Qué conceptos de la red de fondo trabaja cada herramienta del hub.
   Es el único lugar donde está este mapeo: index.html lo lee para iluminar, al pasar el cursor (o el dedo) por una herramienta, estos conceptos
   y sus relaciones, y para anotar la herramienta en la lista plegada «Conceptos y relaciones de la red».

   Cómo editarlo
   · Las claves de HERRAMIENTAS son las de las tarjetas del hub (atributo data-herr de cada <article class="herr">).
   · Los ids de «conceptos» son los de la primera columna del arreglo C de index.html (bloque RED-CONCEPTOS); la lista de abajo da el nombre de cada uno.
     Un id que no exista se ignora (la comprobación está en tests/mapeo.mjs).
   · Un concepto puede estar en varias herramientas. Cada herramienta, en una o varias.
   · Criterio: sólo lo que la herramienta pide usar o entrenar según su ficha del hub (no todo lo que «toca» de lejos).

   Conceptos de la red (id: nombre)
     mat Materia y estados · ato Átomo y modelos atómicos · tab Tabla periódica · enl Enlace químico · rea Reacciones químicas
     cel Célula · met Metabolismo celular · inm Sistema inmune · vac Vacunas · reb Inmunidad de rebaño
     cin Modelo cinético de partículas · tem Temperatura y calor · med Medición y magnitudes · mov Fuerza y movimiento
     car Carga eléctrica · ele Electricidad y circuitos · rad Radio atómico · ion Energía de ionización · neg Electronegatividad
     agu Agua y disoluciones · phh Ácidos, bases y pH · ene Energía y sus transformaciones · ond Ondas: luz y sonido
     cons Conservación de la masa · mit Mitosis y meiosis · adn ADN y herencia · fot Fotosíntesis · ali Alimentación y nutrición
     act Actividad física · sal Factores de la salud · sue Sueño y estrés · cnt Contagio y transmisión · r0 Número reproductivo R₀
     pes Peste negra · cob Cobertura de vacunación · umb Umbral 1 − 1/R₀ · cov Datos reales de COVID-19 · mod Modelos y simulación */
window.HERRAMIENTA_CONCEPTOS = {
  /* Tabla periódica reactiva. Ficha: «tendencias periódicas por posición: radio atómico, energía de ionización, electronegatividad y tipo de enlace». */
  tp: {
    nombre: 'Tabla periódica reactiva',
    conceptos: ['tab', 'rad', 'ion', 'neg', 'enl']
  },

  /* Autodiagnóstico de Bienestar y Salud. Ficha: «factores biológicos, ambientales y sociales de la salud (alimentación, estrés y sueño, consumo, actividad física, entorno)». */
  ad: {
    nombre: 'Autodiagnóstico de Bienestar y Salud',
    conceptos: ['sal', 'ali', 'act', 'sue']
  },

  /* Vacunas e inmunidad de rebaño. Ficha: «el umbral 1 − 1/R₀, un simulador de dos casos (cobertura alta y baja) y datos reales de COVID-19 entre 2020 y 2022». */
  va: {
    nombre: 'Vacunas e inmunidad de rebaño',
    conceptos: ['inm', 'vac', 'reb', 'cnt', 'r0', 'cob', 'umb', 'cov', 'mod']
  },

  /* Mapa de la pandemia. Ficha: «leer datos reales de COVID-19 de 2020 a 2022 (exceso de mortalidad y vacunación completa) y sacar una conclusión con sus límites». */
  cm: {
    nombre: 'Mapa de la pandemia',
    conceptos: ['vac', 'cob', 'cov']
  },

  /* Presentación de la clase «Dos países frente al COVID-19». Ficha: «R₀, inmunidad de rebaño y umbral con animaciones; exceso del mes y acumulado; los supuestos del modelo». */
  cp: {
    nombre: 'Dos países frente al COVID-19 (presentación)',
    conceptos: ['r0', 'reb', 'umb', 'cob', 'cov', 'mod']
  },

  /* Atlas, diagnóstico PAES Ciencias. Ficha: «habilidades científicas del marco PAES» y práctica de Biología por unidad. Los conceptos salen de las áreas del marco
     (diagnostico-paes/data/paes-ciencias-2027/framework.v1.json): BIO-01 célula; BIO-03 mitosis, meiosis y genética; BIO-04 fotosíntesis y respiración;
     FIS-01 ondas; FIS-02 movimiento; FIS-04 electricidad; QUI-01 clasificación de la materia y modelos atómicos; QUI-03 conservación de la materia y soluciones.
     No incluye Química orgánica (QUI-02), Tierra (FIS-03) ni Evolución, que la red no tiene. */
  paes: {
    nombre: 'Atlas, diagnóstico PAES Ciencias',
    conceptos: ['cel', 'met', 'fot', 'mit', 'adn', 'ond', 'mov', 'med', 'car', 'ele', 'mat', 'ato', 'cons', 'agu']
  },

  /* The Black Death: a historian's skills lab (Year 8 History). Es una herramienta de historia: sólo toca la peste como enfermedad. */
  bd: {
    nombre: 'The Black Death: a historian’s skills lab',
    conceptos: ['pes']
  }
};
