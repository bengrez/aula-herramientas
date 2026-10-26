/* Qué conceptos de la red trabaja cada herramienta del hub.
   Es el único lugar donde está este mapeo: index.html lo lee para saber, al pasar el cursor (o el foco) por una herramienta, a qué temas de la red encuadrar
   y qué conceptos resaltar, y para anotar la herramienta en la lista «Temas, conceptos y relaciones de la red». Los temas de una herramienta salen de aquí:
   son los temas (grupos TEMAS de index.html, bloque RED-TEMAS) a los que pertenecen sus conceptos.

   Cómo editarlo
   · Las claves de HERRAMIENTAS son las de las tarjetas del hub (atributo data-herr de cada <article class="herr">).
   · Los ids de «conceptos» son los de la primera columna del arreglo C de index.html (bloque RED-TEMAS); la lista de abajo da el nombre de cada uno.
     Un id que no exista se ignora (la comprobación está en tests/mapeo.mjs, que además exige que cada concepto esté en un solo tema).
   · Un concepto puede estar en varias herramientas. Cada herramienta, en una o varias.
   · Criterio: sólo lo que la herramienta pide usar o entrenar según su ficha del hub (no todo lo que «toca» de lejos).

   Temas y conceptos de la red (id: nombre)
     Materia y átomos: mat Materia y estados · cin Modelo cinético de partículas · ato Átomo y modelos atómicos · tab Tabla periódica · rad Radio atómico
       ion Energía de ionización · neg Electronegatividad · enl Enlace químico · rea Reacciones químicas · cons Conservación de la masa
       agu Agua y disoluciones · phh Ácidos, bases y pH
     Energía y movimiento: ene Energía y sus transformaciones · tem Temperatura y calor · mov Fuerza y movimiento · car Carga eléctrica
       ele Electricidad y circuitos · ond Ondas: luz y sonido
     Célula y cuerpo: cel Célula · met Metabolismo celular · fot Fotosíntesis · mit Mitosis y meiosis · adn ADN y herencia · inm Sistema inmune
     Salud y epidemias: sal Factores de la salud · ali Alimentación y nutrición · act Actividad física · sue Sueño y estrés · cnt Contagio y transmisión
       vac Vacunas · reb Inmunidad de rebaño · r0 Número reproductivo R₀ · cob Cobertura de vacunación · umb Umbral 1 − 1/R₀
     Datos y evidencia: med Medición y magnitudes · cov Datos reales de COVID-19 · exc Exceso de mortalidad · cor Correlación y causalidad · mod Modelos y simulación
     Sociedad e historia: pes Peste negra · soc Consumo y entorno social */
window.HERRAMIENTA_CONCEPTOS = {
  /* Tabla periódica reactiva. Ficha: «tendencias periódicas por posición: radio atómico, energía de ionización, electronegatividad y tipo de enlace».
     ato: el modelo Imán y Escudo se apoya en el núcleo y los niveles. */
  tp: {
    nombre: 'Tabla periódica reactiva',
    conceptos: ['tab', 'ato', 'rad', 'ion', 'neg', 'enl']
  },

  /* Autodiagnóstico de Bienestar y Salud. Ficha: «factores biológicos, ambientales y sociales de la salud (alimentación, estrés y sueño, consumo, actividad física, entorno)».
     soc: el bloque «Consumo y presión social» y el entorno. */
  ad: {
    nombre: 'Autodiagnóstico de Bienestar y Salud',
    conceptos: ['sal', 'ali', 'act', 'sue', 'soc']
  },

  /* Vacunas e inmunidad de rebaño. Ficha: «el umbral 1 − 1/R₀, un simulador de dos casos (cobertura alta y baja) y datos reales de COVID-19 entre 2020 y 2022». */
  va: {
    nombre: 'Vacunas e inmunidad de rebaño',
    conceptos: ['inm', 'vac', 'reb', 'cnt', 'r0', 'cob', 'umb', 'cov', 'mod']
  },

  /* Mapa de la pandemia. Ficha: «leer datos reales de COVID-19 de 2020 a 2022 (exceso de mortalidad y vacunación completa) y sacar una conclusión con sus límites». */
  cm: {
    nombre: 'Mapa de la pandemia',
    conceptos: ['vac', 'cob', 'cov', 'exc', 'cor']
  },

  /* Presentación de la clase «Dos países frente al COVID-19». Ficha: «R₀, inmunidad de rebaño y umbral con animaciones; exceso del mes y acumulado; los supuestos del modelo».
     vac y cnt: láminas 1 y 3; exc y cor: láminas 5, 6 y 8. */
  cp: {
    nombre: 'Dos países frente al COVID-19 (presentación)',
    conceptos: ['vac', 'cnt', 'r0', 'reb', 'umb', 'cob', 'cov', 'mod', 'exc', 'cor']
  },

  /* Atlas, diagnóstico PAES Ciencias. Ficha: «habilidades científicas del marco PAES» y práctica de Biología por unidad. Sólo los conceptos que tocan los ítems
     que existen hoy (banco ancla y práctica de Biología): BIO-01 célula; BIO-03 mitosis y genética; BIO-04 fotosíntesis, metabolismo y flujo de energía (B-01);
     FIS-02 movimiento; FIS-04 electricidad; QUI-03 soluciones. Faltan los de ondas, materia, átomo y conservación hasta que haya ítems. */
  paes: {
    nombre: 'Atlas, diagnóstico PAES Ciencias',
    conceptos: ['cel', 'met', 'fot', 'mit', 'adn', 'mov', 'ele', 'agu', 'ene']
  },

  /* The Black Death: a historian's skills lab (Year 8 History). Es una herramienta de historia: sólo toca la peste como hecho histórico (Sociedad e historia). */
  bd: {
    nombre: 'The Black Death: a historian’s skills lab',
    conceptos: ['pes']
  }
};
