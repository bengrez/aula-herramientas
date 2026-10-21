#!/usr/bin/env python3
"""Copia los 12 países del mapa desde la serie ya verificada de vacunas-rebano (variable D de index.html)
y comprueba las anclas de la tabla de verificación. No procesa el CSV completo.

Uso: python3 extraer_doce.py            (lee ../../vacunas-rebano/index.html y escribe serie.json)
Cada país: n = nombre, e = muertes en exceso acumuladas por millón, v = % con vacunación completa, s = rigurosidad (Oxford).
Para rederivar desde el CSV original de Our World in Data, ver verificar_contra_csv.py.
"""
import json, os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(AQUI, '..', '..', 'vacunas-rebano', 'index.html')
DOCE = ['Bulgaria', 'Portugal', 'Chile', 'Brazil', 'Uruguay', 'United States', 'United Kingdom', 'Peru', 'New Zealand', 'Sweden', 'Norway', 'Australia']

# Anclas (e al cierre de 2020, 2021, 2022; v al cierre de 2021 y 2022). None = sin dato.
ANCLAS = {
    'New Zealand': (-435, -535, -83, 74.4, 79.8), 'Australia': (-131, 60, 920, 75.5, 82.7), 'Norway': (-30, 217, 1116, 72.3, 74.6),
    'Sweden': (716, 935, 1390, 68.8, 72.0), 'Chile': (751, 2000, 3082, 84.4, 90.3), 'Uruguay': (-669, 1048, 2126, 78.4, 84.8),
    'Portugal': (927, 2022, 2965, 83.2, 86.7), 'Peru': (2387, 5477, None, 64.9, 83.5), 'Brazil': (904, 3110, 3767, 66.6, 81.2),
    'United States': (1333, 2888, 3759, 63.4, 69.2), 'United Kingdom': (1158, 2028, 2704, 70.3, 75.2), 'Bulgaria': (2209, 8239, 10166, 28.2, 30.6),
}

def leer_D():
    t = open(HTML, encoding='utf8').read()
    i = t.index('var D = ') + len('var D = ')
    return json.JSONDecoder().raw_decode(t[i:])[0]

def main():
    D = leer_D()
    out = {'meses': D['meses'], 'p': {k: D['p'][k] for k in DOCE}}
    fallas = 0
    for k, (e20, e21, e22, v21, v22) in ANCLAS.items():
        p = out['p'][k]
        real = (p['e'][11], p['e'][23], p['e'][35], p['v'][23], p['v'][35])
        ok = real == (e20, e21, e22, v21, v22)
        fallas += not ok
        print(('ok    ' if ok else 'FALLA ') + k, real if not ok else '')
    if fallas:
        sys.exit('Anclas que no coinciden: ' + str(fallas))
    with open(os.path.join(AQUI, 'serie.json'), 'w', encoding='utf8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('serie.json escrito con', len(DOCE), 'países y', len(out['meses']), 'meses')

main()
