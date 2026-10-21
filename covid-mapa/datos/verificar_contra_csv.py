#!/usr/bin/env python3
"""Rederivacion independiente de e, v, s mensuales (2020-01..2022-12) desde el CSV de OWID.

Uso: python3 -I rederivar_csv.py <owid-covid-data.csv> <serie.json> [salida_rederivado.json]
No importa nada del repo. Compara contra serie.json, revisa anclas, nulls, huecos y extremos mensuales.
"""
import csv, json, sys
from decimal import Decimal, ROUND_HALF_UP

PAISES = ['Bulgaria', 'Portugal', 'Chile', 'Brazil', 'Uruguay', 'United States',
          'United Kingdom', 'Peru', 'New Zealand', 'Sweden', 'Norway', 'Australia']
MESES = ['%d-%02d' % (a, m) for a in (2020, 2021, 2022) for m in range(1, 13)]

csv_path, json_path = sys.argv[1], sys.argv[2]
out_path = sys.argv[3] if len(sys.argv) > 3 else None

# Lectura: por pais, lista ordenada de (fecha, exceso, vacunado, rigurosidad) como str|None
filas = {p: [] for p in PAISES}
with open(csv_path, encoding='utf8', newline='') as f:
    rd = csv.reader(f)
    h = next(rd)
    ix = {c: i for i, c in enumerate(h)}
    iL, iD = ix['location'], ix['date']
    iE, iV, iS = ix['excess_mortality_cumulative_per_million'], ix['people_fully_vaccinated_per_hundred'], ix['stringency_index']
    for r in rd:
        if r[iL] in filas:
            filas[r[iL]].append((r[iD], r[iE] or None, r[iV] or None, r[iS] or None))
for p in PAISES:
    filas[p].sort()
    assert len({x[0] for x in filas[p]}) == len(filas[p]), 'fechas duplicadas en ' + p


def r0(x):  # redondeo al entero, mitad hacia arriba (Decimal) y python round; devolvemos ambos
    d = Decimal(repr(x)) if not isinstance(x, Decimal) else x
    return int(d.quantize(Decimal(1), rounding=ROUND_HALF_UP)), int(round(float(x)))


der = {}
empates = []  # casos en que half-up y half-even difieren
for p in PAISES:
    e, v, s = [], [], []
    for mes in MESES:
        # exceso: ultimo valor no vacio con fecha en el mes
        xs = [x for x in filas[p] if x[0][:7] == mes and x[1] is not None]
        if xs:
            hu, he = r0(float(xs[-1][1]))
            e.append(he)
            if hu != he:
                empates.append((p, 'e', mes, xs[-1][1]))
        else:
            e.append(None)
        # vacunacion: ultimo valor no vacio con fecha <= fin de mes (comparando por prefijo de mes)
        vs = [x for x in filas[p] if x[0][:7] <= mes and x[2] is not None]
        v.append(round(float(vs[-1][2]), 1) if vs else 0.0)
        # rigurosidad: promedio de valores no vacios del mes
        ss = [float(x[3]) for x in filas[p] if x[0][:7] == mes and x[3] is not None]
        if ss:
            m = sum(ss) / len(ss)
            hu, he = r0(m)
            s.append(he)
            if hu != he:
                empates.append((p, 's', mes, m))
        else:
            s.append(None)
    der[p] = {'e': e, 'v': v, 's': s}

if out_path:
    json.dump({'meses': MESES, 'p': der}, open(out_path, 'w'), ensure_ascii=False)

# --- Comparacion contra serie.json
J = json.load(open(json_path, encoding='utf8'))
print('meses coinciden:', J['meses'] == MESES, '| paises en JSON:', len(J['p']), '| paises esperados presentes:', all(p in J['p'] for p in PAISES),
      '| extras en JSON:', sorted(set(J['p']) - set(PAISES)))
dif, total = [], 0
for p in PAISES:
    for k in 'evs':
        for i, mes in enumerate(MESES):
            total += 1
            a, b = J['p'][p][k][i], der[p][k][i]
            if a != b and not (a is not None and b is not None and abs(a - b) < 1e-9):
                dif.append((p, k, mes, a, b))
print('valores comparados:', total, '| diferencias:', len(dif))
for d in dif:
    print('  DIF', d)
print('casos donde half-up != half-even (redondeo):', empates or 'ninguno')

print('\n--- nulls')
for k in 'evs':
    for p in PAISES:
        n = [MESES[i] for i, x in enumerate(der[p][k]) if x is None]
        nj = [MESES[i] for i, x in enumerate(J['p'][p][k]) if x is None]
        if n or nj:
            print(' ', k, p, 'rederivado:', len(n), n, '| JSON:', len(nj), '' if n == nj else 'DISTINTO ' + str(nj))
    print('  total null serie', k, ':', sum(x is None for p in PAISES for x in der[p][k]))

# --- Anclas directo desde el CSV (no desde la serie derivada)
print('\n--- anclas (directo CSV)')
ANC = {'New Zealand': ((-435, -535, -83), (74.4, 79.8)), 'Australia': ((-131, 60, 920), (75.5, 82.7)),
       'Norway': ((-30, 217, 1116), (72.3, 74.6)), 'Sweden': ((716, 935, 1390), (68.8, 72.0)),
       'Chile': ((751, 2000, 3082), (84.4, 90.3)), 'Uruguay': ((-669, 1048, 2126), (78.4, 84.8)),
       'Portugal': ((927, 2022, 2965), (83.2, 86.7)), 'Peru': ((2387, 5477, None), (64.9, 83.5)),
       'Brazil': ((904, 3110, 3767), (66.6, 81.2)), 'United States': ((1333, 2888, 3759), (63.4, 69.2)),
       'United Kingdom': ((1158, 2028, 2704), (70.3, 75.2)), 'Bulgaria': ((2209, 8239, 10166), (28.2, 30.6))}
for p, (ae, av) in ANC.items():
    re_, rv = [], []
    for y in ('2020', '2021', '2022'):
        xs = [x for x in filas[p] if x[0][:7] == y + '-12' and x[1] is not None]
        re_.append(round(float(xs[-1][1])) if xs else None)
    for y in ('2021', '2022'):
        vs = [x for x in filas[p] if x[0] <= y + '-12-31' and x[2] is not None]
        rv.append(round(float(vs[-1][2]), 1) if vs else None)
    ok_e, ok_v = tuple(re_) == ae, tuple(rv) == av
    print('  %-15s exceso esp=%s obt=%s %s | vac esp=%s obt=%s %s' % (p, ae, tuple(re_), 'ok' if ok_e else 'NO', av, tuple(rv), 'ok' if ok_v else 'NO'))

# --- Huecos de exceso a mitad de serie
print('\n--- huecos de exceso a mitad de serie (null entre dos meses con dato)')
hay = False
for p in PAISES:
    e = der[p]['e']
    con = [i for i, x in enumerate(e) if x is not None]
    if not con:
        print(' ', p, 'sin ningun dato'); continue
    huecos = [MESES[i] for i in range(con[0], con[-1] + 1) if e[i] is None]
    print('  %-15s primer dato %s, ultimo dato %s, huecos internos: %s' % (p, MESES[con[0]], MESES[con[-1]], huecos or 'ninguno'))
    hay = hay or bool(huecos)
print('  hay huecos internos:', hay)

# --- Extremos del exceso mensual
print('\n--- exceso del mes = e[i]-e[i-1] (extremos)')
gmax = gmin = None
for p in PAISES:
    e = der[p]['e']
    d = [(e[i] - e[i - 1], MESES[i]) for i in range(1, 36) if e[i] is not None and e[i - 1] is not None]
    nocalc = [MESES[i] for i in range(1, 36) if e[i] is None or e[i - 1] is None]
    mx, mn = max(d), min(d)
    print('  %-15s calculables %d/35 | max %+d (%s) | min %+d (%s) | no calculables: %s' % (p, len(d), mx[0], mx[1], mn[0], mn[1], nocalc))
    if gmax is None or mx[0] > gmax[0]: gmax = (mx[0], p, mx[1])
    if gmin is None or mn[0] < gmin[0]: gmin = (mn[0], p, mn[1])
print('  GLOBAL max:', gmax, '| GLOBAL min:', gmin)
