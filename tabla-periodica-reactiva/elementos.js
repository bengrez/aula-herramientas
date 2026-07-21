/* Datos de los 118 elementos.
   Formato: [Z, simbolo, nombre, grupo, periodo, familia]
   grupo 0 = lantanidos/actinidos (bloque f, fuera de la grilla principal)
   familias: alc, alcT, tra, pos, met (metaloide), nom, hal, nob, lan, act        */
const ELEMENTOS_RAW = [
[1,"H","Hidrógeno",1,1,"nom"],[2,"He","Helio",18,1,"nob"],
[3,"Li","Litio",1,2,"alc"],[4,"Be","Berilio",2,2,"alcT"],[5,"B","Boro",13,2,"met"],
[6,"C","Carbono",14,2,"nom"],[7,"N","Nitrógeno",15,2,"nom"],[8,"O","Oxígeno",16,2,"nom"],
[9,"F","Flúor",17,2,"hal"],[10,"Ne","Neón",18,2,"nob"],
[11,"Na","Sodio",1,3,"alc"],[12,"Mg","Magnesio",2,3,"alcT"],[13,"Al","Aluminio",13,3,"pos"],
[14,"Si","Silicio",14,3,"met"],[15,"P","Fósforo",15,3,"nom"],[16,"S","Azufre",16,3,"nom"],
[17,"Cl","Cloro",17,3,"hal"],[18,"Ar","Argón",18,3,"nob"],
[19,"K","Potasio",1,4,"alc"],[20,"Ca","Calcio",2,4,"alcT"],[21,"Sc","Escandio",3,4,"tra"],
[22,"Ti","Titanio",4,4,"tra"],[23,"V","Vanadio",5,4,"tra"],[24,"Cr","Cromo",6,4,"tra"],
[25,"Mn","Manganeso",7,4,"tra"],[26,"Fe","Hierro",8,4,"tra"],[27,"Co","Cobalto",9,4,"tra"],
[28,"Ni","Níquel",10,4,"tra"],[29,"Cu","Cobre",11,4,"tra"],[30,"Zn","Zinc",12,4,"tra"],
[31,"Ga","Galio",13,4,"pos"],[32,"Ge","Germanio",14,4,"met"],[33,"As","Arsénico",15,4,"met"],
[34,"Se","Selenio",16,4,"nom"],[35,"Br","Bromo",17,4,"hal"],[36,"Kr","Kriptón",18,4,"nob"],
[37,"Rb","Rubidio",1,5,"alc"],[38,"Sr","Estroncio",2,5,"alcT"],[39,"Y","Itrio",3,5,"tra"],
[40,"Zr","Circonio",4,5,"tra"],[41,"Nb","Niobio",5,5,"tra"],[42,"Mo","Molibdeno",6,5,"tra"],
[43,"Tc","Tecnecio",7,5,"tra"],[44,"Ru","Rutenio",8,5,"tra"],[45,"Rh","Rodio",9,5,"tra"],
[46,"Pd","Paladio",10,5,"tra"],[47,"Ag","Plata",11,5,"tra"],[48,"Cd","Cadmio",12,5,"tra"],
[49,"In","Indio",13,5,"pos"],[50,"Sn","Estaño",14,5,"pos"],[51,"Sb","Antimonio",15,5,"met"],
[52,"Te","Teluro",16,5,"met"],[53,"I","Yodo",17,5,"hal"],[54,"Xe","Xenón",18,5,"nob"],
[55,"Cs","Cesio",1,6,"alc"],[56,"Ba","Bario",2,6,"alcT"],
[57,"La","Lantano",0,6,"lan"],[58,"Ce","Cerio",0,6,"lan"],[59,"Pr","Praseodimio",0,6,"lan"],
[60,"Nd","Neodimio",0,6,"lan"],[61,"Pm","Prometio",0,6,"lan"],[62,"Sm","Samario",0,6,"lan"],
[63,"Eu","Europio",0,6,"lan"],[64,"Gd","Gadolinio",0,6,"lan"],[65,"Tb","Terbio",0,6,"lan"],
[66,"Dy","Disprosio",0,6,"lan"],[67,"Ho","Holmio",0,6,"lan"],[68,"Er","Erbio",0,6,"lan"],
[69,"Tm","Tulio",0,6,"lan"],[70,"Yb","Iterbio",0,6,"lan"],[71,"Lu","Lutecio",0,6,"lan"],
[72,"Hf","Hafnio",4,6,"tra"],[73,"Ta","Tantalio",5,6,"tra"],[74,"W","Wolframio",6,6,"tra"],
[75,"Re","Renio",7,6,"tra"],[76,"Os","Osmio",8,6,"tra"],[77,"Ir","Iridio",9,6,"tra"],
[78,"Pt","Platino",10,6,"tra"],[79,"Au","Oro",11,6,"tra"],[80,"Hg","Mercurio",12,6,"tra"],
[81,"Tl","Talio",13,6,"pos"],[82,"Pb","Plomo",14,6,"pos"],[83,"Bi","Bismuto",15,6,"pos"],
[84,"Po","Polonio",16,6,"met"],[85,"At","Astato",17,6,"hal"],[86,"Rn","Radón",18,6,"nob"],
[87,"Fr","Francio",1,7,"alc"],[88,"Ra","Radio",2,7,"alcT"],
[89,"Ac","Actinio",0,7,"act"],[90,"Th","Torio",0,7,"act"],[91,"Pa","Protactinio",0,7,"act"],
[92,"U","Uranio",0,7,"act"],[93,"Np","Neptunio",0,7,"act"],[94,"Pu","Plutonio",0,7,"act"],
[95,"Am","Americio",0,7,"act"],[96,"Cm","Curio",0,7,"act"],[97,"Bk","Berkelio",0,7,"act"],
[98,"Cf","Californio",0,7,"act"],[99,"Es","Einstenio",0,7,"act"],[100,"Fm","Fermio",0,7,"act"],
[101,"Md","Mendelevio",0,7,"act"],[102,"No","Nobelio",0,7,"act"],[103,"Lr","Lawrencio",0,7,"act"],
[104,"Rf","Rutherfordio",4,7,"tra"],[105,"Db","Dubnio",5,7,"tra"],[106,"Sg","Seaborgio",6,7,"tra"],
[107,"Bh","Bohrio",7,7,"tra"],[108,"Hs","Hassio",8,7,"tra"],[109,"Mt","Meitnerio",9,7,"tra"],
[110,"Ds","Darmstadtio",10,7,"tra"],[111,"Rg","Roentgenio",11,7,"tra"],[112,"Cn","Copernicio",12,7,"tra"],
[113,"Nh","Nihonio",13,7,"pos"],[114,"Fl","Flerovio",14,7,"pos"],[115,"Mc","Moscovio",15,7,"pos"],
[116,"Lv","Livermorio",16,7,"pos"],[117,"Ts","Teneso",17,7,"hal"],[118,"Og","Oganesón",18,7,"nob"]
];

/* Zona pedagogica: lo unico que la Guia N3 necesita distinguir. */
const ZONA_DE = {
  alc:"metal", alcT:"metal", tra:"metal", pos:"metal",
  lan:"metal", act:"metal", met:"metaloide",
  nom:"nometal", hal:"nometal", nob:"nometal"
};

const NOMBRE_FAMILIA = {
  alc:"Metal alcalino", alcT:"Metal alcalinotérreo", tra:"Metal de transición",
  pos:"Metal del bloque p", lan:"Lantánido", act:"Actínido",
  met:"Metaloide", nom:"No metal", hal:"Halógeno", nob:"Gas noble"
};

/* Tiron del Iman por columna: cuanta carga nuclear efectiva "siente" el
   electron mas externo. Se usa solo para ordenar cualitativamente, nunca
   se muestran valores al estudiante. */
const TIRON_GRUPO = {
  1:0, 2:1.2, 3:1.8, 4:2.0, 5:2.2, 6:2.4, 7:2.5, 8:2.6, 9:2.7,
  10:2.8, 11:2.9, 12:3.0, 13:3.5, 14:4.3, 15:5.0, 16:5.6, 17:6.2, 18:6.8,
  0:1.9
};

const ELEMENTOS = ELEMENTOS_RAW.map(([z, simbolo, nombre, grupo, periodo, familia]) => {
  const tiron = TIRON_GRUPO[grupo];
  return {
    z, simbolo, nombre, grupo, periodo, familia,
    zona: ZONA_DE[familia],
    // Escudo suma niveles (periodo); Iman resta tamano (tiron del grupo)
    radio: periodo * 10 - tiron,
    // Electronegatividad y energia de ionizacion: misma direccion, inversa al radio
    fuerza: tiron * 1.5 - periodo
  };
});

const PORZ = {};
ELEMENTOS.forEach(e => { PORZ[e.z] = e; });
