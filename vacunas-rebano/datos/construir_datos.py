#!/usr/bin/env python3
"""Reduce el conjunto de COVID-19 de Our World in Data a series mensuales (2020-01 a 2022-12).

Fuente: https://github.com/owid/covid-19-data (public/data/owid-covid-data.csv), CC BY 4.0.
Cita: Mathieu, E., Ritchie, H., Rodés-Guirao, L. et al. «Coronavirus Pandemic (COVID-19)». Our World in Data.
El repositorio de OWID quedó congelado el 19-08-2024.

Uso: python3 construir_datos.py owid-covid-data.csv > datos.json   (el JSON se pega en la variable D de index.html)
Series por país: e = muertes en exceso acumuladas por millón (último valor del mes),
v = % con vacunación completa (último valor publicado hasta fin de mes; 0 antes del primero),
s = índice de rigurosidad de Oxford (promedio mensual).
"""
import csv, collections, datetime, json, sys

NOMBRES = {'New Zealand': 'Nueva Zelanda', 'Australia': 'Australia', 'Singapore': 'Singapur', 'South Korea': 'Corea del Sur',
           'Japan': 'Japón', 'Denmark': 'Dinamarca', 'Norway': 'Noruega', 'Sweden': 'Suecia', 'Chile': 'Chile', 'Uruguay': 'Uruguay',
           'Portugal': 'Portugal', 'Peru': 'Perú', 'Brazil': 'Brasil', 'United States': 'Estados Unidos', 'United Kingdom': 'Reino Unido',
           'Bulgaria': 'Bulgaria', 'Mexico': 'México'}

by = collections.defaultdict(dict)
for r in csv.DictReader(open(sys.argv[1], encoding='utf8')):
    if r['location'] in NOMBRES:
        by[r['location']][r['date']] = r

meses, y, m = [], 2020, 1
while (y, m) <= (2022, 12):
    meses.append('%d-%02d' % (y, m)); m += 1
    if m == 13: y, m = y + 1, 1

def fin_mes(ms):
    y, m = map(int, ms.split('-'))
    return (datetime.date(y + (m == 12), (m % 12) + 1, 1) - datetime.timedelta(1)).isoformat()

out = {}
for en, es in NOMBRES.items():
    L = by[en]; fechas = sorted(L); e, v, s = [], [], []
    for ms in meses:
        ex = [d for d in fechas if d.startswith(ms) and L[d]['excess_mortality_cumulative_per_million'] != '']
        e.append(round(float(L[ex[-1]]['excess_mortality_cumulative_per_million'])) if ex else None)
        vv = [d for d in fechas if d <= fin_mes(ms) and L[d]['people_fully_vaccinated_per_hundred'] != '']
        v.append(round(float(L[vv[-1]]['people_fully_vaccinated_per_hundred']), 1) if vv else 0.0)
        ss = [float(L[d]['stringency_index']) for d in fechas if d.startswith(ms) and L[d]['stringency_index'] != '']
        s.append(round(sum(ss) / len(ss)) if ss else None)
    out[en] = {'n': es, 'e': e, 'v': v, 's': s}
print(json.dumps({'meses': meses, 'p': out}, ensure_ascii=False, separators=(',', ':')))
