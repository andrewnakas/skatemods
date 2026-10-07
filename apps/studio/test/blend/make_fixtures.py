"""Builds the .blend fixtures for the browser .blend reader tests.

Run with each Blender version (3.3 LTS: legacy MVert/MPoly layout; 4.5: generic CustomData
attributes; 5.2: AttributeStorage + the 17-byte "BLENDER17-01v0502" header and 64-bit pointer ids):

  /Applications/Blender-4.5.12.app/Contents/MacOS/Blender -b --factory-startup \
      --python test/blend/make_fixtures.py -- test/fixtures/blend

Writes scene_<ver>.blend (compressed with the version's default: zstd from 3.0) and
scene_<ver>.json (expected stats computed by Blender itself) into the output folder.
"""

import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else os.path.join(os.path.dirname(__file__), "..", "fixtures", "blend"))
os.makedirs(OUT, exist_ok=True)
VER = "%d%d" % bpy.app.version[:2]

# Same items as ReSkate Studio's COLLISION_MODES, so the stored enum index matches.
COLLISION_MODES = [
    ("triangle_mesh", "Exact Triangle Mesh", ""),
    ("convex_parts", "Gameplay Convex (Smart)", ""),
    ("hull", "Forced Single Envelope", ""),
    ("none", "None", ""),
    ("water", "Water", ""),
]


class Sk8ObjectSettings(bpy.types.PropertyGroup):
    collision_mode: bpy.props.EnumProperty(items=COLLISION_MODES, default="triangle_mesh")
    round_rail: bpy.props.BoolProperty(default=False)
    audio_softness: bpy.props.FloatProperty(default=0.2)


class Sk8MaterialSettings(bpy.types.PropertyGroup):
    invisible: bpy.props.BoolProperty(default=False)


# Empty scene.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.utils.register_class(Sk8ObjectSettings)
bpy.utils.register_class(Sk8MaterialSettings)
bpy.types.Object.sk8_object = bpy.props.PointerProperty(type=Sk8ObjectSettings)
bpy.types.Material.sk8_material = bpy.props.PointerProperty(type=Sk8MaterialSettings)

scene = bpy.context.scene
coll = scene.collection
props = bpy.data.collections.new("Props")
coll.children.link(props)


def principled(name, color, rough=0.5, metal=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Alpha"].default_value = alpha
    mat.diffuse_color = color
    return mat


def textured(name, image):
    mat = principled(name, (1, 1, 1, 1), 0.9)
    nt = mat.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image
    nt.links.new(tex.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    return mat


def mesh_object(name, verts, faces, collection=coll):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    collection.objects.link(ob)
    return ob


red = principled("Red", (0.8, 0.1, 0.05, 1.0), 0.3, 0.5)
blue = principled("Blue", (0.1, 0.2, 0.9, 0.5), 0.6, 0.0, 0.5)

checker = bpy.data.images.new("checker", 32, 16)
checker.generated_type = "COLOR_GRID"
# pack() of a generated image is a no-op in background mode: save it as a PNG, then pack that.
tmp_png = os.path.join(bpy.app.tempdir, "checker.png")
checker.filepath_raw = tmp_png
checker.file_format = "PNG"
checker.save()
checker.source = "FILE"
checker.reload()
checker.pack()
checker.filepath = "//textures/checker.png"
checker_mat = textured("Checker", checker)

wall = bpy.data.images.new("wall", 8, 8)
wall.source = "FILE"
wall.filepath = "//textures/wall.png"
wall_mat = textured("Wall", wall)

# 1. Cube: 8 verts, 6 quads, rotated + scaled, ReSkate collision settings.
cube = mesh_object("Cube", [(x, y, z) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)],
                   [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)])
cube.location = (3, -2, 1)
cube.rotation_euler = (0.3, 0.2, 0.9)
cube.scale = (1, 2, 0.5)
cube.data.materials.append(red)
cube.sk8_object.collision_mode = "convex_parts"
cube.sk8_object.round_rail = True
cube.sk8_object.audio_softness = 0.75
for p in cube.data.polygons:
    p.use_smooth = False

# 2. Concave ngon (L shape) parented to a rotated empty.
group = bpy.data.objects.new("Group", None)
coll.objects.link(group)
group.location = (0, 5, 0)
group.rotation_mode = "ZXY"
group.rotation_euler = (0.1, 0.0, math.radians(30))
ngon = mesh_object("Ngon", [(0, 0, 0), (2, 0, 0), (2, 1, 0), (1, 1, 0), (1, 2, 0), (0, 2, 0)],
                   [(0, 1, 2, 3, 4, 5)], props)
ngon.parent = group
ngon.location = (1, 0, 0.5)
ngon.data.materials.append(blue)
ngon.sk8_object.collision_mode = "water"

# 3. UV-mapped 3x2 grid with two materials and object-level material on slot 1.
verts, faces = [], []
for j in range(3):
    for i in range(4):
        verts.append((i, j, 0))
for j in range(2):
    for i in range(3):
        a = j * 4 + i
        faces.append((a, a + 1, a + 5, a + 4))
grid = mesh_object("UVGrid", verts, faces)
grid.location = (-4, 0, 0)
grid.rotation_mode = "QUATERNION"
grid.rotation_quaternion = (0.9238795, 0.0, 0.0, 0.3826834)
grid.data.materials.append(checker_mat)
grid.data.materials.append(red)
grid.material_slots[1].link = "OBJECT"
grid.material_slots[1].material = blue
uv = grid.data.uv_layers.new(name="UVMap")
for poly in grid.data.polygons:
    poly.material_index = poly.index % 2
    for li in poly.loop_indices:
        v = grid.data.vertices[grid.data.loops[li].vertex_index].co
        # A seam between the two rows: the top row's UVs are offset.
        uv.data[li].uv = (v.x / 3.0, v.y / 2.0 + (0.25 if poly.index >= 3 else 0.0))

# 4. Object with a modifier (hidden from render) and a missing image.
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.5, radius2=0.5, depth=2)
me = bpy.data.meshes.new("Pillar")
bm.to_mesh(me)
bm.free()
pillar = bpy.data.objects.new("Pillar", me)
coll.objects.link(pillar)
pillar.location = (0, -5, 1)
pillar.modifiers.new("Subsurf", "SUBSURF")
pillar.hide_render = True
pillar.data.materials.append(wall_mat)

# 5. Curves: a bezier rail and a closed poly rail.
cu = bpy.data.curves.new("RailCurve", "CURVE")
cu.dimensions = "3D"
sp = cu.splines.new("BEZIER")
sp.bezier_points.add(2)
for k, co in enumerate([(0, 0, 0), (2, 1, 0.5), (4, 0, 1)]):
    bp = sp.bezier_points[k]
    bp.co = co
    bp.handle_left_type = bp.handle_right_type = "AUTO"
sp.resolution_u = 4
rail = bpy.data.objects.new("Rail", cu)
coll.objects.link(rail)
rail.location = (0, 0, 2)

cu2 = bpy.data.curves.new("LoopCurve", "CURVE")
cu2.dimensions = "3D"
sp2 = cu2.splines.new("POLY")
sp2.points.add(3)
for k, co in enumerate([(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)]):
    sp2.points[k].co = (*co, 1.0)
sp2.use_cyclic_u = True
loop = bpy.data.objects.new("LoopRail", cu2)
coll.objects.link(loop)
loop.location = (5, 5, 0)
loop.scale = (2, 2, 2)

# 6. Spawn empty rotated 90 degrees about Z.
spawn = bpy.data.objects.new("spawn", None)
coll.objects.link(spawn)
spawn.location = (1, 2, 0.5)
spawn.rotation_euler = (0, 0, math.radians(90))

bpy.context.view_layer.update()


def conv(v):
    return [v[0], v[2], -v[1]]


def flat(m):
    return [m[r][c] for c in range(4) for r in range(4)]  # column-major


expected = {"version": "%d.%d" % bpy.app.version[:2], "objects": {}, "rails": {}, "spawns": []}
for ob in bpy.data.objects:
    if ob.type == "MESH":
        me = ob.data
        mw = ob.matrix_world
        pts = [conv(mw @ v.co) for v in me.vertices]
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        me.calc_loop_triangles()
        area = 0.0
        for t in me.loop_triangles:
            a, b, c = (mw @ me.vertices[i].co for i in t.vertices)
            area += (b - a).cross(c - a).length / 2
        mats = []
        for p in me.polygons:
            slot = ob.material_slots[p.material_index] if p.material_index < len(ob.material_slots) else None
            name = slot.material.name if slot and slot.material else None
            if name not in mats:
                mats.append(name)
        expected["objects"][ob.name] = {
            "vertices": len(me.vertices),
            "triangles": tris,
            "area": area,
            "matrix_world": flat(mw),
            "bbox_min": [min(p[i] for p in pts) for i in range(3)],
            "bbox_max": [max(p[i] for p in pts) for i in range(3)],
            "materials": mats,
            "modifiers": len(ob.modifiers),
            "hide_render": ob.hide_render,
            "collision_mode": ob.sk8_object.collision_mode,
        }
    elif ob.type == "CURVE":
        mw = ob.matrix_world
        sp = ob.data.splines[0]
        if sp.type == "BEZIER":
            knots = [conv(mw @ p.co) for p in sp.bezier_points]
        else:
            knots = [conv(mw @ p.co.xyz) for p in sp.points]
        expected["rails"][ob.name] = {"knots": knots, "closed": sp.use_cyclic_u,
                                      "type": sp.type, "resolution": sp.resolution_u}
    elif ob.type == "EMPTY" and ob.name.casefold().startswith("spawn"):
        m = ob.matrix_world
        gt = conv((m[0][3], m[1][3], m[2][3]))
        gf = conv((m[0][1], m[1][1], m[2][1]))
        expected["spawns"].append({"name": ob.name, "position": gt,
                                   "yaw": math.degrees(math.atan2(gf[0], gf[2]))})

expected["materials"] = {
    m.name: {"base_color": list(m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value),
             "roughness": m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value,
             "metallic": m.node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value,
             "alpha": m.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value}
    for m in bpy.data.materials
}
expected["images"] = {"checker": {"width": checker.size[0], "height": checker.size[1]}}
expected["missing_images"] = ["//textures/wall.png"]

base = os.path.join(OUT, "scene_" + VER)
with open(base + ".json", "w") as f:
    json.dump(expected, f, indent=1)
# Only the compressed file is kept in git (the uncompressed one is ~500 KB); the tests
# decompress it to exercise the raw and gzip paths too.
bpy.context.preferences.filepaths.save_version = 0  # no .blend1 backups
bpy.ops.wm.save_as_mainfile(filepath=base + ".blend", compress=True, check_existing=False)
print("wrote", base)
