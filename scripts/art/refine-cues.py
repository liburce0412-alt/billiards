"""Refine exported billiards cues in Blender; caller binds INPUT_FILE, OUTPUT_ROOT, ASSET_ID.

Keeps tip position, cue length, node hierarchy and runtime cue-role metadata.
No external asset/model service. Run through the validated Blender MCP bridge.
"""
import bpy
import bmesh
import math
import random
from mathutils import Vector

random.seed(2908)
for scene_object in list(bpy.context.scene.objects):
    bpy.data.objects.remove(scene_object, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=INPUT_FILE)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1
body = None
for candidate in scene.objects:
    if candidate.get("cueDimensions"):
        body = candidate
if body is None:
    raise ValueError("Imported cue does not contain cueDimensions")
dimensions = body["cueDimensions"]
length = float(dimensions["length"])
butt_radius = float(dimensions["buttRadius"])
style = str(body.get("cueStyleId", ASSET_ID.replace("cue-", "")))
cyber = style in ["aurora-prism", "holo-laser"]
body["nativeRefined"] = True
body["refinementTool"] = "Blender 4.5 / deterministic PBR authoring"


def bound_points(objects):
    return [obj.matrix_world @ Vector(corner) for obj in objects if obj.type == "MESH" for corner in obj.bound_box]


meshes = [obj for obj in scene.objects if obj.type == "MESH"]
initial_points = bound_points(meshes)
before_min = [min(p[i] for p in initial_points) for i in range(3)]
before_max = [max(p[i] for p in initial_points) for i in range(3)]
if before_max[1] - before_min[1] < length * 0.95:
    raise ValueError("Expected imported cue axis along Blender world Y; refusing wrong-axis remodel")
tip_objects = [obj for obj in meshes if obj.get("cueRole") == "tip"]
tip_before = bound_points(tip_objects)


def packed_image(name, width, height, pixels, linear=False):
    image = bpy.data.images.new(name, width=width, height=height, alpha=False)
    image.colorspace_settings.name = "Non-Color" if linear else "sRGB"
    image.pixels = pixels
    image.pack()
    return image


def node_texture(mat, image, axial_repeat=1):
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    node.interpolation = "Linear"
    if axial_repeat != 1:
        uv = mat.node_tree.nodes.new("ShaderNodeTexCoord")
        mapping = mat.node_tree.nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = (1, axial_repeat, 1)
        mat.node_tree.links.new(uv.outputs["UV"], mapping.inputs["Vector"])
        mat.node_tree.links.new(mapping.outputs["Vector"], node.inputs["Vector"])
    return node


def shader_for(mat):
    mat.use_nodes = True
    return mat.node_tree.nodes.get("Principled BSDF")


def pbr_detail(mat, name, pattern="satin", strength=0.3):
    width, height = 128, 256
    normals, roughness = [], []
    for y in range(height):
        for x in range(width):
            grain = math.sin(x * 0.45 + math.sin(y * 0.031) * 1.3)
            noise = random.random() - 0.5
            if pattern == "leather":
                nx, ny, r = noise * 0.11, math.sin(x * 2.3 + y * 4.1) * 0.04, 0.57 + noise * 0.15
            elif pattern == "carbon":
                direction = ((x // 4 - y // 4) % 4) < 2
                strand = x % 4 if direction else y % 4
                slope = math.cos((strand + 0.5) * math.pi / 4) * 0.13
                nx, ny, r = (slope, 0, 0.34) if direction else (0, slope, 0.40)
            elif pattern == "tip":
                nx, ny, r = noise * 0.12, math.sin(x * 13 + y * 17) * 0.045, 0.79 + noise * 0.15
            else:
                nx, ny, r = grain * 0.023, noise * 0.014, 0.27 + grain * 0.03 + noise * 0.03
            normals.extend((0.5 + nx * strength, 0.5 + ny * strength, 1, 1))
            roughness.extend((r, r, r, 1))
    normal_img = packed_image(name + "_Normal", width, height, normals, True)
    rough_img = packed_image(name + "_Roughness", width, height, roughness, True)
    shader = shader_for(mat)
    normal_map = mat.node_tree.nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.24 if pattern != "tip" else 0.4
    repeat = 16 if pattern == "carbon" else 1
    mat.node_tree.links.new(node_texture(mat, normal_img, repeat).outputs["Color"], normal_map.inputs["Color"])
    mat.node_tree.links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])
    mat.node_tree.links.new(node_texture(mat, rough_img, repeat).outputs["Color"], shader.inputs["Roughness"])


shaft_hex = {
    "heritage": 0xD8BD91, "obsidian": 0x24282D, "jade": 0xD6B98A,
    "royal": 0xD1AE78, "glacier": 0xE1C89F, "ivory": 0xDDC49A,
    "porcelain-wave": 0xE4CDA6, "amber-tiger": 0xDCC08C,
    "aurora-prism": 0x566573, "holo-laser": 0x27323A, "custom": 0xD8BD91,
}


def shaft_surface(mat):
    width, height = 256, 1024
    color = shaft_hex.get(style, 0xD8BD91)
    base = ((color >> 16 & 255) / 255, (color >> 8 & 255) / 255, (color & 255) / 255)
    carbon = cyber or style == "obsidian"
    pixels = []
    for y in range(height):
        for x in range(width):
            if carbon:
                over = ((x // 8 - y // 8) % 4) < 2
                strand = x % 8 if over else y % 8
                v = 0.50 + math.sin((strand + 0.5) * math.pi / 8) * 0.75 + (0.16 if over else 0)
            else:
                warped = x * 0.32 + math.sin(y * 0.0028) * 2.0 + math.sin(y * 0.011) * 0.15
                grain = math.sin(warped) * 0.055 + math.sin(warped * 3.7) * 0.022
                pores = max(0, math.sin(x * 5.3 + math.sin(y * 0.037))) ** 14 * 0.026
                v = 0.93 + grain - pores + (random.random() - 0.5) * 0.016
            pixels.extend((base[0] * v, base[1] * v, base[2] * v, 1))
    shader = shader_for(mat)
    image = packed_image(style + "_LongitudinalShaftColor", width, height, pixels)
    # Match approximately 1 mm woven bundles around and along the shaft;
    # a single axial tile stretches the twill into long stripes.
    mat.node_tree.links.new(node_texture(mat, image, 8 if carbon else 1).outputs["Color"], shader.inputs["Base Color"])
    shader.inputs["Metallic"].default_value = 0.06 if carbon else 0
    shader.inputs["Coat Weight"].default_value = 0.08 if carbon else 0.28
    shader.inputs["Coat Roughness"].default_value = 0.27
    pbr_detail(mat, style + "_Shaft", "carbon" if carbon else "wood", 0.7)


for obj in meshes:
    role = obj.get("cueRole", "")
    if cyber and obj.get("cueCyber"):
        bpy.data.objects.remove(obj, do_unlink=True)
        continue
    if obj.data.materials:
        refined = obj.data.materials[0].copy()
        refined.name = style + "_" + str(role) + "_RefinedPBR"
        obj.data.materials.clear()
        obj.data.materials.append(refined)
        shader = shader_for(refined)
        if role == "shaft":
            shaft_surface(refined)
        elif role in ["forearm", "sleeve", "buttCap"]:
            pbr_detail(refined, style + "_" + str(role), "wood")
            shader.inputs["Coat Weight"].default_value = 0.28
            shader.inputs["Coat Roughness"].default_value = 0.22
        elif role == "wrap":
            pbr_detail(refined, style + "_Grip", "leather", 0.75)
        elif role == "tip":
            pbr_detail(refined, style + "_Tip_" + obj.name, "tip", 1)
        elif role == "ferrule":
            shader.inputs["Roughness"].default_value = 0.24
    # Tiny manufactured edge radius on hard components, never on the contact tip.
    if role in ["ferrule", "buttCap", "sleeve"]:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bevel = obj.modifiers.new("Native manufactured edge bevel", "BEVEL")
        bevel.width = 0.00012
        bevel.segments = 3
        bevel.limit_method = "ANGLE"
        bevel.angle_limit = 0.8
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        obj.select_set(False)
    obj["nativeRefined"] = True


def mat(name, color, metallic=0.6, rough=0.3, emission=0):
    value = bpy.data.materials.new(name)
    shader = shader_for(value)
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = rough
    if emission:
        shader.inputs["Emission Color"].default_value = (*color, 1)
        shader.inputs["Emission Strength"].default_value = emission
    return value


def own(obj, name, material, role, bevel=0):
    obj.name = name
    obj.data.materials.append(material)
    if bevel:
        bpy.context.view_layer.objects.active = obj
        modifier = obj.modifiers.new("Precision chassis radiused edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        normals = obj.modifiers.new("Chassis weighted normals", "WEIGHTED_NORMAL")
        bpy.ops.object.modifier_apply(modifier=normals.name)
    world = obj.matrix_world.copy()
    obj.parent = body
    obj.matrix_world = world
    obj["cueRole"] = role
    obj["cueCyber"] = style
    obj["nativeRefined"] = True
    if role == "energy":
        obj["cueEnergyRing"] = True
    obj.select_set(False)
    return obj


def cyl(name, y, radius, depth, material, role, sides=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius, depth=depth, location=(0, y, 0), rotation=(math.pi / 2, 0, 0))
    return own(bpy.context.object, name, material, role, 0.0005)


def rail(name, y, extent, angle, radius, width, thickness, material, role):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(radius * math.cos(angle), y, radius * math.sin(angle)))
    obj = bpy.context.object
    obj.scale = (thickness, extent, width)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler = (0, -angle, 0)
    return own(obj, name, material, role, min(thickness, width) * 0.20)


def shell_panel(y0, y1, a0, a1, r0, r1, material, label):
    """Closed machined arc panel with visible wall thickness and flat facet faces."""
    thickness = 0.0022
    verts = []
    for y, radius in [(y0, r0), (y1, r1)]:
        for r in [radius, radius - thickness]:
            for a in [a0, (a0 + a1) / 2, a1]:
                verts.append((r * math.cos(a), y, r * math.sin(a)))
    faces = [(0, 1, 7, 6), (1, 2, 8, 7), (3, 9, 10, 4), (4, 10, 11, 5), (0, 6, 9, 3), (2, 5, 11, 8), (0, 3, 4, 1), (1, 4, 5, 2), (6, 7, 10, 9), (7, 8, 11, 10)]
    mesh = bpy.data.meshes.new(label)
    mesh.from_pydata(verts, [], faces)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(label, mesh)
    scene.collection.objects.link(obj)
    return own(obj, label, material, "cyberShell", 0.00045)


if cyber:
    prism = style == "aurora-prism"
    titanium = mat("Pearl titanium chassis" if prism else "Graphite titanium chassis", (0.56, 0.68, 0.74) if prism else (0.046, 0.066, 0.081), 0.78, 0.26)
    graphite = mat("Carbon black recessed structure", (0.011, 0.019, 0.027), 0.45, 0.39)
    silver = mat("Bright milled edge", (0.5, 0.59, 0.64), 0.88, 0.19)
    glow = mat("Embedded cyan energy optics", (0.025, 0.66, 0.86), 0.18, 0.26, 1.5)
    violet = mat("Inset violet diagnostic optics", (0.40, 0.13, 0.85), 0.15, 0.3, 0.85)
    grip_material = mat("Segmented tactile grip", (0.022, 0.037, 0.049), 0.18, 0.63)
    pbr_detail(grip_material, style + "_TechnicalGrip", "leather", 0.9)
    rear = -length / 2
    joint = -length * 0.21
    radius = butt_radius * (1.34 if prism else 1.40)
    cyl("Replaceable shock absorbing butt cap", rear + 0.007, butt_radius * 0.97, 0.014, graphite, "cyberFrame", 48)
    cyl("Precision butt end plate", rear + 0.017, radius, 0.006, silver, "cyberFrame", 6 if prism else 8)
    # Backbone runs through protected, bounded gaps rather than fantasy spikes.
    cyl("Recessed internal reaction spine", (rear + joint) / 2, butt_radius * 0.63, joint - rear - 0.01, graphite, "cyberFrame", 48)
    cyl("Visible contained optical energy core", rear + length * 0.237, butt_radius * 0.70, length * 0.068, glow, "energy", 32)
    sides = 3 if prism else 4
    for i in range(sides):
        a = i * 2 * math.pi / sides + (math.pi / 6 if prism else math.pi / 4)
        # Floating segmented armour exposes recessed rails and small mechanical seams.
        for j in range(3):
            y0 = rear + 0.030 + j * length * 0.055
            y1 = y0 + length * 0.048
            shell_panel(y0, y1, a - 0.42, a + 0.42, radius, radius * 0.96, titanium, "Segmented angular titanium sleeve")
        rail("Recessed longitudinal emission strip", rear + length * 0.11, length * 0.17, a + 0.58, radius * 0.85, 0.0021, 0.0019, glow, "energy")
        rail("Protected optical core cage rail", rear + length * 0.235, length * 0.084, a, radius * 0.98, 0.004, 0.0032, titanium, "cyberShell")
        rail("Inset violet calibration segment", rear + length * 0.074, 0.021, a, radius * 1.02, 0.0024, 0.0010, violet, "inlayLight")
        for j in range(5):
            rail("Flush machined cooling slot", rear + length * (0.136 + j * 0.006), length * 0.0021, a, radius * 1.025, 0.012, 0.0008, graphite, "cyberFrame")
    for j in range(7):
        cyl("Isolated elastomer grip rib", rear + length * (0.19 + j * 0.006), butt_radius * 0.91, length * 0.0045, grip_material, "cyberFrame", 12)
    for y in [rear + length * 0.183, rear + length * 0.282, joint]:
        cyl("Bayonet joint locking collar", y, radius * 0.93, 0.012, titanium, "cyberShell", 6 if prism else 8)
        cyl("Narrow luminous service seal", y + 0.007, radius * 0.87, 0.002, glow, "energy", 32)
    cyl("Shaft locking nut", joint + 0.013, butt_radius * 0.94, 0.026, silver, "cyberFrame", 12)
    for i in range(6):
        angle = i * math.pi / 3
        rail("Forward joint latch", joint + 0.013, 0.017, angle, butt_radius * 0.95, 0.003, 0.0012, graphite, "cyberFrame")

# Group only newly made shells with identical runtime roles, retaining existing metadata.
if cyber:
    for role in ["cyberShell", "cyberFrame", "energy", "inlayLight"]:
        parts = [o for o in scene.objects if o.type == "MESH" and o.get("cueCyber") == style and o.get("cueRole") == role]
        if len(parts) > 1:
            bpy.ops.object.select_all(action="DESELECT")
            for obj in parts:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = parts[0]
            bpy.ops.object.join()
            parts[0].name = style + "_Blender_" + role

bpy.context.view_layer.update()
tip_after = bound_points(tip_objects)
if len(tip_before) != len(tip_after) or any((a - b).length > 0.000001 for a, b in zip(tip_before, tip_after)):
    raise ValueError("Cue contact tip changed position; refusing export")
for image in bpy.data.images:
    if image.users and image.source == "FILE" and image.packed_file is None:
        image.pack()

# Review-only lighting/camera; never part of the runtime model.
world = bpy.data.worlds.new("Neutral cue inspection studio")
world.use_nodes = True
world.node_tree.nodes.get("Background").inputs["Color"].default_value = (0.05, 0.065, 0.08, 1)
world.node_tree.nodes.get("Background").inputs["Strength"].default_value = 0.6
scene.world = world
for at, energy, size in [((0.32, -0.12, 0.42), 60, 0.6), ((-0.28, 0.1, 0.25), 35, 0.5)]:
    data = bpy.data.lights.new("_Preview_Softbox", "AREA")
    data.energy = energy
    data.size = size
    obj = bpy.data.objects.new("_Preview_Softbox", data)
    scene.collection.objects.link(obj)
    obj.location = at
    obj.rotation_euler = (Vector((0, 0, 0)) - Vector(at)).to_track_quat("-Z", "Y").to_euler()
camera_data = bpy.data.cameras.new("_Preview_CueCamera")
camera = bpy.data.objects.new("_Preview_CueCamera", camera_data)
scene.collection.objects.link(camera)
camera.location = (0.76, -0.04, 0.30)
camera.rotation_euler = (Vector((0, 0, 0)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = length * 1.17
scene.camera = camera
scene.render.resolution_x = 1600
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
for area in bpy.context.screen.areas:
    if area.type == "VIEW_3D":
        area.spaces.active.region_3d.view_perspective = "CAMERA"
        area.spaces.active.shading.type = "MATERIAL"

bpy.ops.object.select_all(action="DESELECT")
for obj in scene.objects:
    if obj.type in ["MESH", "EMPTY"] and not obj.name.startswith("_Preview"):
        obj.select_set(True)
scene["source_asset"] = INPUT_FILE
scene["refined_asset"] = ASSET_ID
scene["cue_length_m"] = length
scene["contact_tip_verified_unchanged"] = True
bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_ROOT + "/assets/blender/legacy/" + ASSET_ID + ".blend", check_existing=False)
bpy.ops.export_scene.gltf(filepath=OUTPUT_ROOT + "/dist/models/legacy-refined/" + ASSET_ID + ".glb", export_format="GLB", use_selection=True, export_yup=True, export_apply=True, export_extras=True, export_lights=False, export_cameras=False)
print("CUE_REFINED", ASSET_ID, "LENGTH", length, "TIP_UNCHANGED", True)
