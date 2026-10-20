#!/usr/bin/env python3
"""Build the browser GLB from the real 3D-printed CAD parts.

Input : Robotic+Arm+with+Servo+&+Arduino/*.stl   (the author's own CAD export)
Output: public/models/cobot-arm.glb               (one node per part)
        public/models/cobot-arm.manifest.json     (node -> joint group mapping)

The GLB keeps every printed part as a separate named node so the WebGL rig can
articulate them independently. All transforms (joint pivots, axis directions,
rest poses) live in src/three/assembly.ts so the assembly can be re-authored
without re-running this script.
"""
import json
import os
import glob

import numpy as np
import trimesh

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAD = os.path.join(ROOT, "Robotic+Arm+with+Servo+&+Arduino")
OUT_DIR = os.path.join(ROOT, "public", "models")

# Joint group each printed part belongs to. Mirrored in src/three/assembly.ts.
GROUPS = {
    "Alt_Kasa": "base",
    "Tabla_Alt": "base",
    "Alt_Govde": "turret",
    "Alt_Kapak": "turret",
    "Mil_3": "turret",
    "Mil_1": "turret",
    "Mil_2": "forearm",
    "Alt_Kol": "upperArm",
    "On_Kol": "forearm",
    "El": "forearm",
    "El_Ust": "forearm",
    "Servo_Disli": "forearm",
    "Mil_Disli": "forearm",
    "Servo_Cable_Holder": "upperArm",
    "Bilek": "wrist",
    "Disli": "gripper",
    "Parmak X 2": "gripper",
    "Parmak_2 X 2": "gripper",
    "Parmak_Disli X 2": "gripper",
    "Jack_Cover": "base",
}

# Which CAD part each node is named after, plus the display label used by the UI.
LABELS = {
    "Alt_Kasa": "Controller enclosure",
    "Tabla_Alt": "Base plate",
    "Alt_Govde": "Rotating base drum",
    "Alt_Kapak": "Turret deck",
    "Mil_3": "Yaw column",
    "Mil_1": "Shoulder axle",
    "Mil_2": "Wrist axle",
    "Alt_Kol": "Upper arm link",
    "On_Kol": "Forearm link",
    "El": "Elbow servo plate",
    "El_Ust": "Elbow servo cover",
    "Servo_Disli": "Elbow servo horn",
    "Servo_Cable_Holder": "Servo cable clamp",
    "Bilek": "Wrist housing",
    "Disli": "Drive gear",
    "Parmak X 2": "Gripper finger carriage",
    "Parmak_2 X 2": "Gripper finger pad",
    "Parmak_Disli X 2": "Finger rack gear",
    "Jack_Cover": "Power jack cover",
}

MATERIAL = {
    "printed": "#b53322",
    "printed_dark": "#7c2417",
    "metal": "#9aa1ab",
    "gear": "#2b2e34",
}


def clean(mesh):
    """Weld duplicate vertices and drop degenerate faces.

    The welded mesh is what trimesh wants, and it keeps the exported GLB
    small. The normals are faceted in the browser instead (see
    `facetGeometry` in src/three/RobotModel.tsx): splitting the vertices
    here would triple the download for something the GPU can do for free.
    """
    mesh = trimesh.Trimesh(vertices=mesh.vertices, faces=mesh.faces, process=True)
    mesh.merge_vertices()
    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.remove_unreferenced_vertices()
    # fix_normals() needs scipy for the body graph; the STLs are already
    # consistently wound, so recompute winding from the signed volume instead.
    if mesh.volume < 0:
        mesh.invert()
    mesh.vertex_normals = None
    return mesh


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    scene = trimesh.Scene()
    manifest = {"unit": "mm", "parts": []}
    total_tris = 0
    total_verts = 0

    for path in sorted(glob.glob(os.path.join(CAD, "*.stl"))):
        name = os.path.splitext(os.path.basename(path))[0]
        mesh = clean(trimesh.load(path, process=False))
        key = name.replace(" ", "_")
        scene.add_geometry(mesh, node_name=key, geom_name=key)
        tris = len(mesh.faces)
        total_tris += tris
        total_verts += len(mesh.vertices)
        manifest["parts"].append({
            "name": key,
            "label": LABELS.get(name, name),
            "group": GROUPS.get(name, "base"),
            "triangles": tris,
            "bounds": [[round(float(v), 3) for v in mesh.bounds[0]],
                       [round(float(v), 3) for v in mesh.bounds[1]]],
        })
        print(f"  {key:24s} tris={tris:6d} verts={len(mesh.vertices):6d}  "
              f"bbox={np.round(mesh.bounds[0], 1)}..{np.round(mesh.bounds[1], 1)}", flush=True)

    glb_path = os.path.join(OUT_DIR, "cobot-arm.glb")
    data = scene.export(file_type="glb")
    with open(glb_path, "wb") as fh:
        fh.write(data)
    manifest["triangles"] = total_tris
    manifest["vertices"] = total_verts
    manifest["materials"] = MATERIAL
    with open(os.path.join(OUT_DIR, "cobot-arm.manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=2)

    print(f"\nwrote {glb_path}  ({len(data) / 1024:.0f} KB, {total_tris} triangles, {total_verts} vertices)")


if __name__ == "__main__":
    main()
