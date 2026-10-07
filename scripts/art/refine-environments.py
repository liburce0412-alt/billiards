"""Refine the eight legacy billiards environments in Blender.

The MCP caller binds INPUT_FILE, OUTPUT_ROOT and ASSET_ID. Imported hierarchy,
legacyNode paths and runtime shader proxies remain intact. Dimensions are in
the original architectural metre space; Blender applies the imported scale.
"""
import bpy
import bmesh
import math
import random
from mathutils import Vector, Matrix

random.seed(20261005)
for scene_object in list(bpy.context.scene.objects):
    bpy.data.objects.remove(scene_object, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=INPUT_FILE)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
theme = ASSET_ID.replace("environment-", "")
floor = -0.6143625
architecture = None
for obj in scene.objects:
    if obj.name == theme + "-architecture":
        architecture = obj
if architecture is None:
    raise ValueError("Imported environment lacks its original architecture root")
bpy.context.view_layer.update()
up = (architecture.matrix_world.to_3x3() @ Vector((0, 0, 1))).normalized()
detail_rotation = 0
if up.y > 0.99:
    # The glTF importer bakes +90deg into mesh geometry, while retaining the
    # original wrapper's -90deg in this empty. Compensate NEW details only.
    detail_rotation = math.pi / 2
elif up.z < 0.99:
    raise ValueError("Unexpected imported basis; refusing to rotate legacy scene")


def is_proxy(obj):
    return obj.type == "MESH" and any(mat and mat.get("requiresRuntimeMaterial") for mat in obj.data.materials)


proxies = [obj for obj in scene.objects if is_proxy(obj)]
proxy_state = [(obj, obj.matrix_world.copy(), len(obj.data.vertices), len(obj.data.polygons), [mat for mat in obj.data.materials]) for obj in proxies]
original_meshes = [obj for obj in scene.objects if obj.type == "MESH" and obj not in proxies]
original_count = len(original_meshes)
architecture["nativeRefined"] = True
architecture["refinementTool"] = "Blender 4.5 / authored geometry and packed PBR"


def shader_for(mat):
    if mat is None or not mat.use_nodes:
        return None
    for node in mat.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            return node
    return None


def texture_detail(mat, pattern, strength):
    """A real glTF normal texture; preserve the imported base colour and UVs."""
    shader = shader_for(mat)
    if shader is None or shader.inputs["Normal"].is_linked:
        return
    pixels = []
    size = 128
    for y in range(size):
        for x in range(size):
            noise = random.random() - 0.5
            if pattern == "wood":
                nx = math.cos(x * 0.43 + math.sin(y * 0.049) * 0.5) * 0.1
                ny = math.sin(y * 0.3 + x * 0.13) * 0.014
            elif pattern == "leather":
                nx = math.sin(x * 2.3 + y * 4.1) * 0.07
                ny = math.cos(y * 2.6 + x * 3.1) * 0.07
            elif pattern == "metal":
                nx, ny = noise * 0.018, math.sin(y * 3.7) * 0.055
            else:
                nx = math.sin(x * 1.31 + y * 0.83) * 0.035 + noise * 0.04
                ny = math.cos(y * 1.7 + x * 0.77) * 0.035 + noise * 0.04
            pixels.extend((0.5 + nx, 0.5 + ny, 1, 1))
    image = bpy.data.images.new(theme + "_" + pattern + "_microfinish_" + mat.name, width=size, height=size, alpha=False)
    image.colorspace_settings.name = "Non-Color"
    image.pixels = pixels
    image.pack()
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    uv = mat.node_tree.nodes.new("ShaderNodeTexCoord")
    mapping = mat.node_tree.nodes.new("ShaderNodeMapping")
    mapping.inputs['Scale'].default_value = (16, 16, 1)
    mat.node_tree.links.new(uv.outputs['UV'], mapping.inputs['Vector'])
    mat.node_tree.links.new(mapping.outputs['Vector'], tex.inputs['Vector'])
    normal = mat.node_tree.nodes.new("ShaderNodeNormalMap")
    normal.inputs["Strength"].default_value = strength * 0.35
    mat.node_tree.links.new(tex.outputs["Color"], normal.inputs["Color"])
    mat.node_tree.links.new(normal.outputs["Normal"], shader.inputs["Normal"])
    mat["nativeRefined"] = True


repair_counts = {'snow_foundation': 0, 'telescope_gimbal': 0, 'reflector': 0}
replacement_materials = {}
replacement_geometry = {}
authoring_frame = architecture.matrix_world @ Matrix.Rotation(detail_rotation, 4, 'X')


def repair_legacy_surface(obj, mesh):
    """Repair only identified connected source components in metre space."""
    if theme not in ['aurora-hall', 'nebula', 'lunar-observatory']:
        return
    to_author = authoring_frame.inverted() @ obj.matrix_world
    from_author = to_author.inverted()
    pending = set(mesh.verts)
    components = []
    while pending:
        first = pending.pop()
        stack, component = [first], [first]
        while stack:
            current = stack.pop()
            for edge in current.link_edges:
                neighbour = edge.other_vert(current)
                if neighbour in pending:
                    pending.remove(neighbour)
                    component.append(neighbour)
                    stack.append(neighbour)
        components.append(component)
    for component in components:
        points = [to_author @ vertex.co for vertex in component]
        low = Vector([min(point[axis] for point in points) for axis in range(3)])
        high = Vector([max(point[axis] for point in points) for axis in range(3)])
        size, center = high-low, (high+low)*.5
        if theme == 'aurora-hall' and abs(size.x-34)<.01 and abs(size.y-16)<.01 and len(component)>500:
            # The mountain mesh undulates below the old slab top, producing
            # repeated crossing triangles. Keep the low snow field above that
            # slab, retaining the original foundation and arch-foot heights.
            for point in points:
                point.z = max(point.z, floor-.055)
            indices = {vertex: index for index, vertex in enumerate(component)}
            terrain_faces = []
            for face in mesh.faces:
                if all(vertex in indices for vertex in face.verts):
                    face_indices = tuple(indices[vertex] for vertex in face.verts)
                    a, b, c = [points[index] for index in face_indices[:3]]
                    if (b-a).cross(c-a).z < 0:
                        face_indices = tuple(reversed(face_indices))
                    terrain_faces.append(face_indices)
            replacement_geometry['snow'] = ([tuple(point) for point in points], terrain_faces)
            bmesh.ops.delete(mesh, geom=component, context='VERTS')
            repair_counts['snow_foundation'] += 1
        if theme == 'nebula' and abs(abs(center.x)-3.3)<.01 and abs(center.y-2.1)<.01 and abs(center.z-(floor+.85))<.01 and all(abs(size[axis]-.7)<.01 for axis in range(3)):
            replacement_materials['gimbal'] = obj.data.materials[0]
            bmesh.ops.delete(mesh, geom=component, context='VERTS')
            repair_counts['telescope_gimbal'] += 1
        if theme == 'lunar-observatory' and abs(center.x+2.95)<.01 and abs(center.y-2.65)<.01 and abs(size.x-1.9)<.01 and abs(size.y-1.9)<.01 and .37<size.z<.39:
            replacement_materials['reflector'] = obj.data.materials[0]
            bmesh.ops.delete(mesh, geom=component, context='VERTS')
            repair_counts['reflector'] += 1


refined_materials = {}
for obj in original_meshes:
    is_surface = obj.name.startswith(theme + "-") and obj.name.endswith("-surface")
    for slot in obj.material_slots:
        old = slot.material
        if old is None:
            continue
        key = old.name
        if key not in refined_materials:
            mat = old.copy()
            mat.name = theme + "_Refined_" + key
            shader = shader_for(mat)
            if theme == 'spectra' and shader and shader.inputs['Transmission Weight'].default_value > .1:
                # An optical prism should transmit the scene instead of reading
                # as a blue metal wedge under the game's lighting.
                shader.inputs['Base Color'].default_value = (.94, .98, 1, 1)
                shader.inputs['Transmission Weight'].default_value = .92
                shader.inputs['Metallic'].default_value = 0
                shader.inputs['Roughness'].default_value = .035
                shader.inputs['IOR'].default_value = 1.46
            if shader and shader.inputs["Alpha"].default_value > 0.9 and shader.inputs['Transmission Weight'].default_value < 0.05:
                metal = shader.inputs["Metallic"].default_value
                pattern = "metal" if metal > 0.4 else "stone"
                if theme == "club" and obj.name == "club-2-surface":
                    pattern = "wood"
                    shader.inputs["Roughness"].default_value = 0.39
                    shader.inputs["Coat Weight"].default_value = 0.16
                    shader.inputs["Coat Roughness"].default_value = 0.3
                if theme == "club" and obj.name == "club-5-surface":
                    pattern = "leather"
                    shader.inputs["Roughness"].default_value = 0.68
                    shader.inputs["Sheen Weight"].default_value = 0.12
                texture_detail(mat, pattern, 0.24 if pattern == "stone" else 0.32)
            refined_materials[key] = mat
        slot.material = refined_materials[key]
    if is_surface:
        # Three's batched non-indexed primitives need welded corners before bevels.
        obj.data = obj.data.copy()
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        bmesh.ops.remove_doubles(mesh, verts=list(mesh.verts), dist=0.000001)
        repair_legacy_surface(obj, mesh)
        bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
        mesh.to_mesh(obj.data)
        mesh.free()
        # Imported split normals describe the pre-weld triangles. Clear them
        # before bevel/weighted normals to avoid ripples on curved instruments.
        obj.data.normals_split_custom_set([(0, 0, 0)] * len(obj.data.loops))
        bevel = obj.modifiers.new("Native edge machining", "BEVEL")
        bevel.width = 0.015 if theme == "club" and obj.name == "club-5-surface" else 0.004
        bevel.segments = 3
        bevel.limit_method = "ANGLE"
        bevel.angle_limit = 0.65
        bevel.use_clamp_overlap = True
        bevel.harden_normals = True
        for face in obj.data.polygons:
            face.use_smooth = True
        normals = obj.modifiers.new("Area weighted architectural normals", "WEIGHTED_NORMAL")
        normals.keep_sharp = True
        normals.weight = 40
        obj["nativeRefined"] = True
        obj["refinementDetail"] = "Welded topology, machined edges, weighted normals and packed surface detail"

details = bpy.data.objects.new(theme + "-blender-details", None)
scene.collection.objects.link(details)
details.parent = architecture
details.rotation_euler.x = detail_rotation
details["nativeRefined"] = True
bpy.context.view_layer.update()
detail_up = (details.matrix_world.to_3x3() @ Vector((0, 0, 1))).normalized()
if detail_up.z < 0.99:
    raise ValueError("New detail frame is not world Z-up")
new_parts = []


def material(name, color, metallic=0, roughness=0.5, emission=0):
    mat = bpy.data.materials.new(theme + "_Detail_" + name)
    mat.use_nodes = True
    shader = shader_for(mat)
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission:
        shader.inputs["Emission Color"].default_value = (*color, 1)
        shader.inputs["Emission Strength"].default_value = emission
    mat["nativeRefined"] = True
    return mat


steel = material("Brushed steel", (0.29, 0.35, 0.39), 0.85, 0.27)
bronze = material("Satin champagne bronze", (0.46, 0.285, 0.11), 0.78, 0.3)
dark = material("Rubber and recessed seams", (0.019, 0.025, 0.03), 0, 0.74)
seam = material("Natural upholstery piping", (0.14, 0.064, 0.021), 0, 0.7)
cream = material("Carved limestone detail", (0.76, 0.72, 0.62), 0, 0.53)
ice = material("Frosted crystalline edge", (0.52, 0.79, 0.86), 0.05, 0.36)
cyan = material("Instrument status light", (0.03, 0.44, 0.59), 0.2, 0.3, 1.4)
for mat, pattern in [(steel, "metal"), (bronze, "metal"), (cream, "stone"), (seam, "leather")]:
    texture_detail(mat, pattern, 0.22)


def finish_object(obj, name, mat, bevel=0):
    obj.name = name
    obj.parent = details
    obj.data.materials.append(mat)
    obj["nativeRefined"] = True
    new_parts.append(obj)
    if bevel:
        modifier = obj.modifiers.new("Soft manufactured edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        modifier.use_clamp_overlap = True
    return obj


def box(name, at, size, mat, bevel=0.004, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at, rotation=rotation)
    obj = bpy.context.object
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_object(obj, name, mat, bevel)


def cylinder(name, at, radius, depth, mat, vertices=24, direction=(0, 0, 1)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=at)
    obj = bpy.context.object
    obj.rotation_euler = Vector(direction).to_track_quat("Z", "Y").to_euler()
    return finish_object(obj, name, mat, min(0.002, depth * 0.1))


def ring(name, at, radius, thickness, mat, direction=(0, 0, 1)):
    bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=6, location=at, major_radius=radius, minor_radius=thickness)
    obj = bpy.context.object
    obj.rotation_euler = Vector(direction).to_track_quat("Z", "Y").to_euler()
    for face in obj.data.polygons:
        face.use_smooth = True
    return finish_object(obj, name, mat)


def rod(name, a, b, radius, mat, vertices=8):
    va, vb = Vector(a), Vector(b)
    return cylinder(name, (va + vb) * 0.5, radius, (vb - va).length, mat, vertices, vb - va)


def path(name, points, radius, mat):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, at in zip(spline.points, points):
        point.co = (*at, 1)
    obj = bpy.data.objects.new(name, curve)
    scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    return finish_object(bpy.context.object, name, mat)


def bolts(at, radius, count=6, mat=steel):
    for i in range(count):
        angle = i * 2 * math.pi / count
        cylinder("Captive hex fastener", (at[0] + radius * math.cos(angle), at[1] + radius * math.sin(angle), at[2]), 0.014, 0.012, mat, 6)


if theme == "club":
    for side in [-1, 1]:
        for seat in range(3):
            x, y, z = side * 3.22, -1.24 + seat * 0.64, floor + 0.625
            points = [(x - 0.295, y - 0.274, z), (x + 0.295, y - 0.274, z), (x + 0.305, y - 0.264, z), (x + 0.305, y + 0.264, z), (x + 0.295, y + 0.274, z), (x - 0.295, y + 0.274, z), (x - 0.305, y + 0.264, z), (x - 0.305, y - 0.264, z), (x - 0.295, y - 0.274, z)]
            path("Hand sewn seat piping", points, 0.006, seam)
            x = side * 3.39
            path("Backrest tailored welt", [(x, y - 0.27, floor + 0.63), (x, y - 0.27, floor + 1.055), (x, y + 0.27, floor + 1.055), (x, y + 0.27, floor + 0.63)], 0.005, seam)
        for row in range(3):
            z = floor + 0.35 + row * 0.77
            for edge in [-1, 1]:
                box("Recessed shelf bracket", (side * 2.6 + edge * 0.78, 3.18, z - 0.075), (0.035, 0.24, 0.11), bronze)
            box("Gallery shelf front inlay", (side * 2.6, 2.927, z), (1.82, 0.009, 0.014), bronze, 0.001)
        ring("Side table brass edge", (side * 3.2, -2.1, floor + 0.65), 0.29, 0.008, bronze)
    for x in [-3.69, -1.49, 1.49, 3.69]:
        box("Vertical cabinet reveal", (x, 3.28, floor + 1.32), (0.01, 0.012, 2.52), dark, 0)
elif theme == "spectra":
    cylinder("Prism pedestal service collar", (-2, 2.4, floor + 0.31), 0.43, 0.025, steel)
    bolts((-2, 2.4, floor + 0.333), 0.38, 8)
    box("Optical source machined housing", (-3.35, 2.4, floor + 1.1), (0.2, 0.33, 0.33), steel, 0.018)
    ring("Optical aperture retaining ring", (-3.23, 2.4, floor + 1.1), 0.115, 0.015, dark, (1, 0, 0))
    for i in range(7):
        z = floor + 0.3 + i * 0.27
        box("Spectrometer detector bezel", (2.65, 3.59, z), (0.65, 0.08, 0.21), steel, 0.012)
        box("Inset detector display", (2.65, 3.539, z), (0.53, 0.012, 0.12), dark, 0.004)
    for x in [-3.3, -1.3, 1.3, 3.3]:
        box("Gallery floor expansion joint", (x, 0, floor + 0.001), (0.004, 7.3, 0.002), dark, 0)
elif theme == "galaxy":
    for i in range(9):
        angle = math.pi * (0.08 + i * 0.105)
        x, y = math.cos(angle) * 3.65, math.sin(angle) * 3.65
        cylinder("Observation rib footing", (x, y, floor + 0.035), 0.16, 0.07, steel, 12)
        bolts((x, y, floor + 0.077), 0.12, 4)
    for x in [-2.6, 2.6]:
        for row in range(3):
            for column in range(6):
                box("Console tactile input key", (x - 0.29 + column * 0.11, 1.01 + row * 0.073, floor + 0.708), (0.075, 0.048, 0.012), dark, 0.004)
        box("Console status strip", (x, 1.34, floor + 0.709), (0.67, 0.013, 0.007), cyan, 0.001)
        path("Console cable conduit", [(x, 1.27, floor + 0.6), (x, 1.36, floor + 0.14), (x, 1.75, floor + 0.075)], 0.025, dark)
elif theme == "nebula":
    if repair_counts['telescope_gimbal'] != 2:
        raise ValueError('Expected exactly two telescope spherical gimbals')
    for x in [-3.3, 3.3]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=.35, location=(x, 2.1, floor+.85))
        gimbal = finish_object(bpy.context.object, 'Smooth telescope spherical gimbal', replacement_materials['gimbal'])
        for face in gimbal.data.polygons:
            face.use_smooth = True
        cylinder("Telescope azimuth bearing", (x, 2.1, floor + 0.085), 0.24, 0.055, steel)
        bolts((x, 2.1, floor + 0.119), 0.195, 8)
        ring("Telescope elevation joint", (x, 2.1, floor + 0.86), 0.395, 0.026, steel, (1, 0, 0))
        path("Telescope flexible cable loom", [(x + 0.27, 2.12, floor + 0.89), (x + 0.37, 2.05, floor + 0.64), (x + 0.27, 2.08, floor + 0.34), (x + 0.17, 2.09, floor + 0.24)], 0.022, dark)
        box("Telescope service controller", (x + 0.18, 2.06, floor + 0.32), (0.12, 0.21, 0.23), steel, 0.014)
        for j in range(5):
            box("Controller cooling louvre", (x + 0.245, 2.06, floor + 0.26 + j * 0.027), (0.004, 0.145, 0.008), dark, 0.001)
elif theme == "aurora-hall":
    if repair_counts['snow_foundation'] != 1:
        raise ValueError('Expected one snow mountain field above the foundation')
    snow_material = material('Snow field diffuse', (.79, .86, .89), 0, .85)
    snow_mesh = bpy.data.meshes.new('Continuous snow heightfield mesh')
    snow_vertices, snow_faces = replacement_geometry['snow']
    snow_mesh.from_pydata(snow_vertices, [], snow_faces)
    snow_mesh.update()
    snow = bpy.data.objects.new('Continuous snow heightfield', snow_mesh)
    scene.collection.objects.link(snow)
    finish_object(snow, 'Continuous snow heightfield', snow_material)
    for face in snow_mesh.polygons:
        face.use_smooth = True
    for i in range(4):
        y, width = 2.5 + i * 0.75, 3.3 - i * 0.16
        for side in [-1, 1]:
            x = side * width
            for branch in range(3):
                offset = (branch - 1) * 0.045
                path("Ice vein at structural foot", [(x + offset, y - 0.1, floor + 0.015), (x + offset - side * 0.07, y - 0.09, floor + 0.35), (x + offset - side * 0.11, y - 0.08, floor + 0.68)], 0.006, ice)
    for side in [-1, 1]:
        path("Frost rim at ice platform", [(side * 3.56, -0.3, floor + 0.018), (side * 3.48, 0.6, floor + 0.018), (side * 3.22, 1.45, floor + 0.018)], 0.012, ice)
elif theme == "sky-temple":
    columns = [(x, y) for x in [-3.25, 3.25] for y in [-1.9, 0, 1.9, 3]] + [(-1.1, 3), (1.1, 3)]
    for x, y in columns:
        for z, radius, depth in [(floor + 0.16, 0.245, 0.035), (floor + 0.23, 0.23, 0.025), (floor + 2.24, 0.18, 0.04), (floor + 2.35, 0.255, 0.035)]:
            cylinder("Carved column torus moulding", (x, y, z), radius, depth, cream, 40)
        box("Capital lower abacus", (x, y, floor + 2.405), (0.5, 0.5, 0.05), cream, 0.013)
    for side in [-1, 1]:
        for y in [-1.45, -0.85, -0.25, 0.35, 0.95, 1.55, 2.15, 2.75]:
            box("Entablature carved dentil", (side * 3.25, y, floor + 2.435), (0.46, 0.11, 0.08), cream, 0.008)
    for x in [-3, -2.4, -1.8, -1.2, -0.6, 0, 0.6, 1.2, 1.8, 2.4, 3]:
        box("Rear cornice dentil", (x, 2.95, floor + 2.435), (0.11, 0.45, 0.08), cream, 0.008)
elif theme == "abyss-palace":
    for i in range(7):
        angle = i / 6 * math.pi
        x, y = math.cos(angle) * 3.1, math.sin(angle) * 3.1
        cylinder("Pressure rib bolted foot", (x, y, floor + 0.024), 0.18, 0.045, steel, 16)
        bolts((x, y, floor + 0.053), 0.139, 6)
        ring("Pressure rib service gasket", (x * 1.059, y * 1.059, 1.18), 0.075, 0.008, dark)
    ring("Dry deck watertight expansion seal", (0, 0, floor + 0.007), 2.99, 0.011, dark)
    for angle in [0.27, 1.05, 2.09, 2.87]:
        x, y = math.cos(angle) * 2.96, math.sin(angle) * 2.96
        cylinder("Deck pressure inspection cover", (x, y, floor + 0.022), 0.06, 0.025, steel, 16)
elif theme == "lunar-observatory":
    if repair_counts['reflector'] != 1:
        raise ValueError('Expected one original parabolic reflector')
    # A closed 18mm reflector shell replaces the reversed, single-sided lathe.
    # Both bowl and underside remain visible with glTF backface culling.
    vertices, faces = [], []
    radial, rings = 64, 16
    for underside in [False, True]:
        offset = len(vertices)
        vertices.append((-2.95, 2.65, .45-(.018 if underside else 0)))
        for radial_ring in range(1, rings+1):
            radius = .95*radial_ring/rings
            for segment in range(radial):
                angle = math.tau*segment/radial
                vertices.append((-2.95+radius*math.cos(angle), 2.65+radius*math.sin(angle), .45+.42*radius*radius-(.018 if underside else 0)))
        for segment in range(radial):
            face = (offset, offset+1+segment, offset+1+(segment+1)%radial)
            faces.append(tuple(reversed(face)) if underside else face)
        for radial_ring in range(rings-1):
            for segment in range(radial):
                inner = offset+1+radial_ring*radial
                outer = inner+radial
                next_segment = (segment+1)%radial
                face = (inner+segment, outer+segment, outer+next_segment, inner+next_segment)
                faces.append(tuple(reversed(face)) if underside else face)
    shell_offset = 1+rings*radial
    rim_offset = 1+(rings-1)*radial
    for segment in range(radial):
        next_segment = (segment+1)%radial
        faces.append((rim_offset+segment, rim_offset+shell_offset+segment, rim_offset+shell_offset+next_segment, rim_offset+next_segment))
    reflector_mesh = bpy.data.meshes.new('Closed parabolic reflector mesh')
    reflector_mesh.from_pydata(vertices, [], faces)
    reflector_mesh.update()
    reflector = bpy.data.objects.new('Solid parabolic reflector', reflector_mesh)
    scene.collection.objects.link(reflector)
    finish_object(reflector, 'Solid parabolic reflector', replacement_materials['reflector'])
    for face in reflector_mesh.polygons:
        face.use_smooth = True
    ring("Radio reflector reinforced rolled rim", (-2.95, 2.65, 0.45 + 0.42 * 0.95 * 0.95), 0.95, 0.018, steel)
    cylinder("Antenna pedestal bolted flange", (-2.95, 2.65, floor + 0.042), 0.31, 0.08, steel, 16)
    bolts((-2.95, 2.65, floor + 0.09), 0.255, 8)
    box("Antenna service electronics", (-2.6, 2.65, floor + 0.33), (0.24, 0.34, 0.46), cream, 0.022)
    path("Shielded antenna cable", [(-2.59, 2.65, floor + 0.56), (-2.55, 2.8, floor + 0.75), (-2.8, 2.86, 0.46)], 0.026, dark)
    for row in range(2):
        center_y = 1.9 + row * 1.5
        for j in range(5):
            local_y = -0.42 + j * 0.21
            y = center_y + local_y * math.cos(0.25) - 0.045 * math.sin(0.25)
            z = 0.02 + local_y * math.sin(0.25) + 0.045 * math.cos(0.25)
            box("Photovoltaic cell busbar", (3.05, y, z), (1.73, 0.006, 0.003), steel, 0, (0.25, 0, 0))
        for edge in [-1, 1]:
            rod("Solar array cable trunk", (2.2, center_y + edge * 0.49, -0.14), (3.9, center_y + edge * 0.49, -0.14), 0.014, dark)
else:
    raise ValueError("Unrecognised environment theme")

# New small parts are batched by material. Existing named batches stay intact
# because the host restores animated/shader nodes by their legacy paths.
part_groups = [(mat, [obj for obj in new_parts if obj.data.materials[0] == mat]) for mat in [steel, bronze, dark, seam, cream, ice, cyan]]
for mat, parts in part_groups:
    if not parts:
        continue
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.convert(target="MESH")
    if len(parts) > 1:
        bpy.ops.object.join()
    parts[0].name = theme + "-native-detail-" + mat.name

bpy.context.view_layer.update()
for obj, matrix, vertices, polygons, materials in proxy_state:
    if len(obj.data.vertices) != vertices or len(obj.data.polygons) != polygons or list(obj.data.materials) != materials:
        raise ValueError("Runtime shader proxy changed during refinement")
    if any(abs(obj.matrix_world[r][c] - matrix[r][c]) > 0.000001 for r in range(4) for c in range(4)):
        raise ValueError("Runtime shader proxy transform changed")

for image in bpy.data.images:
    if image.users and image.source == "FILE" and image.packed_file is None:
        image.pack()
evaluated = bpy.context.evaluated_depsgraph_get()
triangle_count = 0
for obj in scene.objects:
    if obj.type != "MESH" or obj in proxies:
        continue
    result = obj.evaluated_get(evaluated)
    mesh = result.to_mesh()
    mesh.calc_loop_triangles()
    triangle_count += len(mesh.loop_triangles)
    result.to_mesh_clear()
architecture["nativeRefinementBudget"] = {"triangles": triangle_count, "originalMeshCount": original_count, "shaderProxiesPreserved": len(proxies)}
architecture['componentRepairs'] = repair_counts
if triangle_count > 500000:
    raise ValueError("Refined environment exceeds 500k triangle safety limit")

world = bpy.data.worlds.new("Environment review studio")
world.use_nodes = True
world.node_tree.nodes.get("Background").inputs["Color"].default_value = (0.17, 0.2, 0.25, 1)
world.node_tree.nodes.get("Background").inputs["Strength"].default_value = 0.5
scene.world = world
for at, energy, size in [((0, -1, 5), 1100, 5), ((-4, -2, 3), 700, 4)]:
    data = bpy.data.lights.new("_Preview_Softbox", "AREA")
    data.energy, data.size = energy, size
    light = bpy.data.objects.new("_Preview_Softbox", data)
    scene.collection.objects.link(light)
    light.location = at
    light.rotation_euler = (Vector((0, 1, 0.3)) - light.location).to_track_quat("-Z", "Y").to_euler()
data = bpy.data.cameras.new("_Preview_EnvironmentCamera")
camera = bpy.data.objects.new("_Preview_EnvironmentCamera", data)
scene.collection.objects.link(camera)
camera.location = (5.8, -7.5, 4.3)
camera.rotation_euler = (Vector((0, 1.4, 0.75)) - camera.location).to_track_quat("-Z", "Y").to_euler()
data.lens = 37
scene.camera = camera
scene.render.resolution_x, scene.render.resolution_y = 1600, 900
scene.render.resolution_percentage = 100
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene["source_asset"] = INPUT_FILE
scene["refined_asset"] = ASSET_ID
scene["nativeRefined"] = True
scene["shaderProxiesPreserved"] = len(proxies)
bpy.ops.object.select_all(action="DESELECT")
for obj in scene.objects:
    if obj.type in ["MESH", "EMPTY"] and not obj.name.startswith("_Preview"):
        obj.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_ROOT + "/assets/blender/legacy/" + ASSET_ID + ".blend", check_existing=False)
bpy.ops.export_scene.gltf(filepath=OUTPUT_ROOT + "/dist/models/legacy-refined/" + ASSET_ID + ".glb", export_format="GLB", use_selection=True, export_yup=True, export_apply=True, export_extras=True, export_lights=False, export_cameras=False)
print("ENVIRONMENT_REFINED", ASSET_ID, "TRIANGLES", triangle_count, "PROXIES_PRESERVED", len(proxies))
# The runtime sky is a large enclosing shader shell. Keep it in the source and
# export, but hide non-architecture shells during orthographic visual reviews.
# Framing a target with MCP look does not isolate other scene objects.
architecture_members = list(architecture.children_recursive)
for obj in scene.objects:
    if obj.type == 'MESH' and obj not in architecture_members:
        obj.hide_set(True)
