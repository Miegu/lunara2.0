#!/usr/bin/env python3
"""Inspect a LOLA GeoTIFF DEM without changing the source data.

Usage:
    python inspect_lola_dem.py /path/to/Site04_final_adj_5mpp_surf.tif

Requires: rasterio, numpy, matplotlib
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from rasterio.enums import Resampling


def safe_json(value: Any) -> Any:
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        value = float(value)
        return value if math.isfinite(value) else None
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {str(k): safe_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [safe_json(v) for v in value]
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("geotiff", type=Path, help="Input LOLA GeoTIFF")
    parser.add_argument("--out", type=Path, default=None, help="Output folder (default: <input>_inspection)")
    args = parser.parse_args()

    tif = args.geotiff.expanduser().resolve()
    if not tif.is_file():
        parser.error(f"File not found: {tif}")
    out_dir = (args.out or tif.parent / f"{tif.stem}_inspection").expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    with rasterio.open(tif) as src:
        if src.count < 1:
            raise RuntimeError("The GeoTIFF contains no raster bands.")

        arr = src.read(1, masked=True)
        valid = np.asarray(arr.compressed(), dtype=np.float64)
        if valid.size == 0:
            raise RuntimeError("No valid pixels found in band 1; check NoData metadata.")

        p = np.percentile(valid, [1, 2, 5, 50, 95, 98, 99])
        nodata_masked = int(arr.mask.sum()) if np.ma.isMaskedArray(arr) else 0
        total = int(src.width * src.height)
        stats = {
            "input_file": str(tif),
            "driver": src.driver,
            "width_pixels": src.width,
            "height_pixels": src.height,
            "band_count": src.count,
            "band_1_dtype": src.dtypes[0],
            "band_1_nodata": src.nodatavals[0],
            "band_1_unit": src.units[0] if src.units else None,
            "band_1_scale": src.scales[0] if src.scales else None,
            "band_1_offset": src.offsets[0] if src.offsets else None,
            "crs": src.crs.to_string() if src.crs else None,
            "crs_wkt": src.crs.to_wkt() if src.crs else None,
            "transform": list(src.transform),
            "pixel_size_map_units": [abs(src.transform.a), abs(src.transform.e)],
            "bounds": {
                "left": src.bounds.left,
                "bottom": src.bounds.bottom,
                "right": src.bounds.right,
                "top": src.bounds.top,
            },
            "valid_pixel_count": int(valid.size),
            "masked_pixel_count": nodata_masked,
            "masked_pixel_percent": 100.0 * nodata_masked / total if total else None,
            "valid_value_min": float(np.min(valid)),
            "valid_value_max": float(np.max(valid)),
            "valid_value_mean": float(np.mean(valid)),
            "valid_value_std": float(np.std(valid)),
            "percentiles_1_2_5_50_95_98_99": [float(x) for x in p],
            "dataset_tags": src.tags(),
            "band_1_tags": src.tags(1),
            "warning": (
                "Confirm vertical units, projection, coordinate frame, pixel registration, "
                "and NoData semantics against the official product README before using the DEM in calculations."
            ),
        }

        # A lightweight preview only; the original GeoTIFF remains unchanged.
        max_dim = 1400
        scale = max(1, math.ceil(max(src.width, src.height) / max_dim))
        preview = src.read(
            1,
            masked=True,
            out_shape=(max(1, math.ceil(src.height / scale)), max(1, math.ceil(src.width / scale))),
            resampling=Resampling.average,
        )

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    preview_data = np.ma.asarray(preview)
    preview_valid = preview_data.compressed()
    vmin, vmax = np.percentile(preview_valid, [2, 98])
    fig, ax = plt.subplots(figsize=(10, 8), constrained_layout=True)
    im = ax.imshow(preview_data, cmap="terrain", vmin=vmin, vmax=vmax)
    ax.set_title(f"LOLA DEM preview — {tif.name}")
    ax.set_xlabel("Raster column (preview; downsampled)")
    ax.set_ylabel("Raster row (preview; downsampled)")
    fig.colorbar(im, ax=ax, label="Stored pixel value (verify units)")
    preview_path = out_dir / f"{tif.stem}_preview.png"
    fig.savefig(preview_path, dpi=160)
    plt.close(fig)

    metadata_path = out_dir / "metadata.json"
    metadata_path.write_text(json.dumps(safe_json(stats), indent=2, ensure_ascii=False), encoding="utf-8")

    print(json.dumps(safe_json(stats), indent=2, ensure_ascii=False))
    print(f"\nPreview: {preview_path}")
    print(f"Metadata: {metadata_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
