"""Blender MCP authoring pass for legacy robot geometry and billiard balls.

Caller supplies INPUT_FILE, OUTPUT_ROOT and ASSET_ID. Keep object transforms,
runtime metadata, ball UVs and each geometry's physical bounding volume.
"""
import bpy
import bmesh
import math
from mathutils import Vector

for scene_object in list(bpy.context.scene.objects):
    bpy.data.objects.remove(scene_object, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=INPUT_FILE)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
meshes = [o for o in scene.objects if o.type == 'MESH']
prototype = ASSET_ID.startswith('robot-prototype-')
shape = ASSET_ID.replace('robot-prototype-', '')
changes = []


def limits(mesh):
    return ([min(v.co[i] for v in mesh.vertices) for i in range(3)],
            [max(v.co[i] for v in mesh.vertices) for i in range(3)])


def restore_bounds(mesh, original):
    lo, hi = limits(mesh)
    for vertex in mesh.vertices:
        for axis in range(3):
            if hi[axis] - lo[axis] > 1e-8:
                ratio = (vertex.co[axis] - lo[axis]) / (hi[axis] - lo[axis])
                vertex.co[axis] = original[0][axis] + ratio * (original[1][axis] - original[0][axis])


for obj in meshes:
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    original = limits(obj.data)
    if prototype:
        # glTF duplicates vertices at normal and UV boundaries. Subdivision
        # must see welded topology or every triangle shrinks separately.
        topology = bmesh.new()
        topology.from_mesh(obj.data)
        bmesh.ops.remove_doubles(topology, verts=list(topology.verts), dist=0.00001)
        bmesh.ops.recalc_face_normals(topology, faces=list(topology.faces))
        topology.to_mesh(obj.data)
        topology.free()
    if prototype and shape == 'cylinder':
        # Rebuild the ten-sided joint sleeve as a turned, bevelled surface.
        # Retain its local axis and exact instance envelope, including the
        # original slightly elliptical bounds used by the live rig.
        spans = [original[1][axis] - original[0][axis] for axis in range(3)]
        axis = spans.index(min(spans))
        radial = [index for index in range(3) if index != axis]
        center = [(original[0][index] + original[1][index]) * .5 for index in range(3)]
        vertices, faces = [], []
        rings = [(-.5, .965), (-.49, .99), (-.475, 1), (.475, 1), (.49, .99), (.5, .965)]
        segments = 48
        for height, radius in rings:
            for index in range(segments):
                angle = index * 2 * math.pi / segments
                point = list(center)
                point[axis] += height * spans[axis]
                point[radial[0]] += math.cos(angle) * radius * spans[radial[0]] * .5
                point[radial[1]] += math.sin(angle) * radius * spans[radial[1]] * .5
                vertices.append(point)
        for ring in range(len(rings) - 1):
            for index in range(segments):
                following = (index + 1) % segments
                faces.append((ring * segments + index, ring * segments + following,
                              (ring + 1) * segments + following, (ring + 1) * segments + index))
        faces.extend([tuple(reversed(range(segments))),
                      tuple((len(rings) - 1) * segments + index for index in range(segments))])
        refined = bpy.data.meshes.new('Turned joint sleeve')
        refined.from_pydata(vertices, [], faces)
        for material in obj.data.materials:
            refined.materials.append(material)
        obj.data = refined
        topology = bmesh.new()
        topology.from_mesh(refined)
        bmesh.ops.recalc_face_normals(topology, faces=list(topology.faces))
        topology.to_mesh(refined)
        topology.free()
        changes.append('48-segment turned sleeve with rounded rim; instance bounds preserved')
    elif prototype and shape in ('sphere', 'helmet'):
        # Subdivide the low-resolution silhouette, preserving the semantic
        # shape and original local coordinates used by every instance.
        subdivision = obj.modifiers.new('Silhouette refinement', 'SUBSURF')
        subdivision.levels = 2
        subdivision.subdivision_type = 'CATMULL_CLARK'
        bpy.ops.object.modifier_apply(modifier=subdivision.name)
        restore_bounds(obj.data, original)
        changes.append('subdivision + original-bounds projection')
    elif prototype:
        bevel = obj.modifiers.new('Machined edge chamfer', 'BEVEL')
        bevel.width = 0.015 if shape == 'cylinder' else 0.01
        bevel.segments = 3
        bevel.limit_method = 'ANGLE'
        bevel.angle_limit = math.radians(35)
        bevel.use_clamp_overlap = True
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        restore_bounds(obj.data, original)
        changes.append('welded seams + machined chamfer')
    for face in obj.data.polygons:
        face.use_smooth = not (prototype and shape == 'cylinder' and len(face.vertices) > 4)
    if prototype:
        obj.data.normals_split_custom_set([(0, 0, 0)] * len(obj.data.loops))
    if not prototype:
        # Number/stripe texture coordinates remain untouched; physical radius
        # and vertex positions must match the live simulation exactly.
        center = Vector([(original[0][i] + original[1][i]) * .5 for i in range(3)])
        normals = [(v.co - center).normalized() for v in obj.data.vertices]
        obj.data.normals_split_custom_set_from_vertices(normals)
        changes.append('radial normals + polished phenolic finish; UV/radius unchanged')
    for material in obj.data.materials:
        if not material:
            continue
        material.use_nodes = True
        shader = material.node_tree.nodes.get('Principled BSDF')
        if not shader:
            continue
        if prototype:
            shader.inputs['Metallic'].default_value = .64
            shader.inputs['Roughness'].default_value = .29
        else:
            shader.inputs['Roughness'].default_value = .21
            shader.inputs['Metallic'].default_value = 0
            shader.inputs['IOR'].default_value = 1.54
            shader.inputs['Coat Weight'].default_value = .38
            shader.inputs['Coat Roughness'].default_value = .12
    obj['nativeRefined'] = True
    obj['refinementTool'] = 'Blender MCP'
    obj['refinementChanges'] = changes[-1]
    current = limits(obj.data)
    for edge in range(2):
        for axis in range(3):
            if abs(current[edge][axis] - original[edge][axis]) > 0.00001:
                raise ValueError('Refinement changed a collision/instance bound')

for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.spaces.active.shading.type = 'MATERIAL'
        area.spaces.active.overlay.show_overlays = False
bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_ROOT + '/assets/blender/legacy/' + ASSET_ID + '.blend')
bpy.ops.export_scene.gltf(filepath=OUTPUT_ROOT + '/dist/models/legacy-refined/' + ASSET_ID + '.glb',
                          export_format='GLB', export_extras=True, export_apply=True, export_yup=True)
print('REFINED', ASSET_ID, changes, 'BOUNDS_PRESERVED')
