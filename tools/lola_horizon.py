"""Genera máscaras de horizonte a partir de los mapas polares de LOLA.

Para cada sitio recorre el mapa de alturas en todas las direcciones y guarda,
para cada azimut, la elevación del terreno más alto visto desde el sitio.
El resultado es un CSV `azimuth_deg,horizon_elevation_deg` que la web carga
con el botón «Load local horizon CSV».

Uso:
    python tools/lola_horizon.py --download                # baja el mapa (462 MB)
    python tools/lola_horizon.py                           # sitios de tools/sites_south_pole.csv
    python tools/lola_horizon.py --site "Mi sitio,-89.2,23.1"

El mapa queda en data/lola/ (ignorado por git). Los CSV salen en horizons/.
"""

import argparse
import csv
import math
import re
import sys
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DEM = ROOT / "data" / "lola" / "LDEM_80S_40M.IMG"
DEFAULT_SITES = ROOT / "tools" / "sites_south_pole.csv"
DEFAULT_OUT = ROOT / "horizons"
PDS_URL = "https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/"


# ---------------------------------------------------------------- mapa LOLA

class PolarDEM:
    """Mapa LOLA polar sur (PDS3, estereográfica polar sobre esfera)."""

    def __init__(self, img_path: Path):
        lbl_path = img_path.with_suffix(".LBL")
        label = lbl_path.read_text(errors="replace")

        def num(key):
            m = re.search(rf"^\s*{key}\s*=\s*([-+0-9.eE]+)", label, re.M)
            if not m:
                raise ValueError(f"{lbl_path.name}: falta {key}")
            return float(m.group(1))

        if "POLAR STEREOGRAPHIC" not in label or num("CENTER_LATITUDE") != -90:
            raise ValueError("Solo se admiten mapas LOLA polares del polo sur.")
        self.lines = int(num("LINES"))
        self.samples = int(num("LINE_SAMPLES"))
        self.scale_m = num("MAP_SCALE")                     # m/píxel
        self.line0 = num("LINE_PROJECTION_OFFSET")          # píxel del polo (base 0)
        self.sample0 = num("SAMPLE_PROJECTION_OFFSET")
        self.dn_scale = num("SCALING_FACTOR")               # DN -> metros
        self.radius_m = num("A_AXIS_RADIUS") * 1000.0       # radio de referencia
        self.data = np.memmap(img_path, dtype="<i2", mode="r",
                              shape=(self.lines, self.samples))
        self.name = img_path.name

    def to_pixel(self, lat_deg, lon_deg):
        """lat/lon planetocéntricas (este positivo) -> (línea, muestra) fraccionarias.

        Orientación comprobada con el cráter Shackleton (89,67° S, 129,78° E):
        sale un hoyo de ~4 km rodeado de borde, como debe ser.
        """
        lat = np.radians(lat_deg)
        lon = np.radians(lon_deg)
        r = 2.0 * self.radius_m * np.tan(np.pi / 4.0 + lat / 2.0)
        x = r * np.sin(lon)
        y = r * np.cos(lon)
        return self.line0 - y / self.scale_m, self.sample0 + x / self.scale_m

    def height(self, lat_deg, lon_deg):
        """Altura (m) sobre la esfera de referencia, interpolación bilineal.
        NaN fuera del mapa."""
        line, samp = self.to_pixel(np.asarray(lat_deg, float), np.asarray(lon_deg, float))
        inside = (line >= 0) & (line < self.lines - 1) & (samp >= 0) & (samp < self.samples - 1)
        out = np.full(line.shape, np.nan)
        if not inside.any():
            return out
        l, s = line[inside], samp[inside]
        l0, s0 = np.floor(l).astype(np.int64), np.floor(s).astype(np.int64)
        fl, fs = l - l0, s - s0
        d = self.data
        h = (d[l0, s0] * (1 - fl) * (1 - fs) + d[l0, s0 + 1] * (1 - fl) * fs
             + d[l0 + 1, s0] * fl * (1 - fs) + d[l0 + 1, s0 + 1] * fl * fs)
        out[inside] = h * self.dn_scale
        return out


# ---------------------------------------------------------------- horizonte

def destination(lat_deg, lon_deg, bearing_rad, central_rad):
    """Punto a una distancia angular dada siguiendo un rumbo (círculo máximo)."""
    p1 = math.radians(lat_deg)
    l1 = math.radians(lon_deg)
    sin_p2 = (math.sin(p1) * np.cos(central_rad)
              + math.cos(p1) * np.sin(central_rad) * np.cos(bearing_rad))
    p2 = np.arcsin(np.clip(sin_p2, -1, 1))
    l2 = l1 + np.arctan2(np.sin(bearing_rad) * np.sin(central_rad) * math.cos(p1),
                         np.cos(central_rad) - math.sin(p1) * sin_p2)
    return np.degrees(p2), np.degrees(l2)


def horizon_mask(dem, lat, lon, max_km=200.0, az_step=0.5, mast_m=2.5, chunk=60):
    """Devuelve (azimuts, elevación del horizonte, distancia del obstáculo, alcance)
    para un sitio. Azimut desde el norte hacia el este, como en la web."""
    if abs(lat + 90) < 1e-6:
        raise ValueError("En el polo exacto el azimut no está definido; aparta el sitio un poco.")
    h_site = float(dem.height(np.array([lat]), np.array([lon]))[0])
    if math.isnan(h_site):
        raise ValueError("El sitio cae fuera del mapa LOLA (cubre de 80° S al polo).")
    R = dem.radius_m
    r_obs = R + h_site + mast_m

    step = dem.scale_m                                   # un píxel por paso
    dist = np.arange(step, max_km * 1000.0 + step, step)
    central = dist / R
    azimuths = np.arange(0.0, 360.0, az_step)

    elev = np.empty(azimuths.size)
    obst_km = np.empty(azimuths.size)
    reach_km = np.empty(azimuths.size)
    for i in range(0, azimuths.size, chunk):
        az = np.radians(azimuths[i:i + chunk])[:, None]
        plat, plon = destination(lat, lon, az, central[None, :])
        h = dem.height(plat, plon)
        r_t = R + h
        # ángulo de elevación del punto del terreno, con la curvatura de la Luna
        ang = np.degrees(np.arctan2(r_t * np.cos(central) - r_obs, r_t * np.sin(central)))
        valid = ~np.isnan(ang)
        ang = np.where(valid, ang, -90.0)
        k = ang.argmax(axis=1)
        elev[i:i + chunk] = ang[np.arange(ang.shape[0]), k]
        obst_km[i:i + chunk] = dist[k] / 1000.0
        # hasta dónde llega el mapa en esa dirección
        last = np.where(valid.any(axis=1),
                        valid.shape[1] - 1 - np.argmax(valid[:, ::-1], axis=1), 0)
        reach_km[i:i + chunk] = dist[last] / 1000.0
    return azimuths, elev, obst_km, reach_km, h_site


# ---------------------------------------------------------------- E/S

def slug(text):
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or "sitio"


def read_sites(path):
    sites = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(r for r in f if not r.lstrip().startswith("#")):
            sites.append((row["name"].strip(), float(row["lat"]), float(row["lon"])))
    return sites


def download(dem_path):
    dem_path.parent.mkdir(parents=True, exist_ok=True)
    for suffix in (".LBL", ".IMG"):
        target = dem_path.with_suffix(suffix)
        if target.exists():
            print(f"Ya existe {target.name}")
            continue
        url = PDS_URL + target.name
        print(f"Descargando {url} ...")
        tmp = target.with_suffix(suffix + ".part")
        urllib.request.urlretrieve(url, tmp)
        tmp.rename(target)


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")   # acentos y ° en la consola de Windows
    except (AttributeError, ValueError):
        pass
    ap =argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dem", type=Path, default=DEFAULT_DEM,
                    help="mapa LOLA polar sur .IMG con su .LBL al lado (por defecto LDEM_80S_40M)")
    ap.add_argument("--download", action="store_true", help="descarga el mapa si no está y termina")
    ap.add_argument("--sites", type=Path, default=DEFAULT_SITES, help="CSV con columnas name,lat,lon")
    ap.add_argument("--site", action="append", default=[], metavar="NOMBRE,LAT,LON",
                    help="sitio suelto (se puede repetir); si se da, se ignora --sites")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--max-km", type=float, default=200.0, help="alcance del trazado (km)")
    ap.add_argument("--az-step", type=float, default=0.5, help="paso de azimut (grados)")
    ap.add_argument("--mast", type=float, default=2.5, help="altura del observador sobre el suelo (m)")
    args = ap.parse_args()

    if args.download:
        download(args.dem)
        return
    if not args.dem.exists():
        sys.exit(f"No encuentro {args.dem}. Ejecuta primero:  python tools/lola_horizon.py --download")

    if args.site:
        sites = []
        for s in args.site:
            name, lat, lon = [p.strip() for p in s.rsplit(",", 2)]
            sites.append((name, float(lat), float(lon)))
    else:
        sites = read_sites(args.sites)

    dem = PolarDEM(args.dem)
    args.out.mkdir(parents=True, exist_ok=True)
    print(f"Mapa {dem.name}: {dem.samples}x{dem.lines} px, {dem.scale_m:g} m/px\n")

    for name, lat, lon in sites:
        try:
            az, el, obst, reach, h_site = horizon_mask(dem, lat, lon, args.max_km, args.az_step, args.mast)
        except ValueError as e:
            print(f"- {name} ({lat}, {lon}): OMITIDO. {e}\n")
            continue
        short = reach < args.max_km - dem.scale_m / 1000.0
        path = args.out / f"{slug(name)}.csv"
        with open(path, "w", newline="", encoding="utf-8") as f:
            f.write(f"# LUNARA horizon mask | site: {name} | lat {lat} lon {lon}\n")
            f.write(f"# source: {dem.name} ({dem.scale_m:g} m/px) | ground height {h_site:.0f} m"
                    f" | observer +{args.mast:g} m | trace {args.max_km:g} km\n")
            if short.any():
                f.write(f"# WARNING: {short.mean()*100:.0f}% of azimuths leave the map before"
                        f" {args.max_km:g} km (min reach {reach.min():.0f} km)\n")
            f.write("azimuth_deg,horizon_elevation_deg\n")
            for a, e in zip(az, el):
                f.write(f"{a:g},{e:.3f}\n")
        print(f"- {name} ({lat}, {lon})")
        print(f"  suelo {h_site:.0f} m | horizonte medio {el.mean():.2f}°, "
              f"máx {el.max():.2f}° (az {az[el.argmax()]:g}°, a {obst[el.argmax()]:.1f} km), mín {el.min():.2f}°")
        if short.any():
            print(f"  AVISO: en el {short.mean()*100:.0f}% de azimuts el mapa se acaba antes de "
                  f"{args.max_km:g} km (mínimo {reach.min():.0f} km)")
        print(f"  -> {path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}\n")


if __name__ == "__main__":
    main()
