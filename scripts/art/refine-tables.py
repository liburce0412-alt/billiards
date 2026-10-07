"""Run inside Blender through its MCP execute_blender_code tool.

Prefix INPUT_FILE, OUTPUT_ROOT and ASSET_ID before submitting through Blender MCP.
The table contact surfaces, pocket openings and all authored transforms stay put.
"""
import bpy
from math import pi, sin
from mathutils import Vector

def replace_compact_cloth(material, shader):
    """Replace the old large pictorial decal with a packed fine woven surface."""
    if material.get('fineWovenCloth'):
        return
    palette = {
        'american-ivory': 0x16798D, 'american-walnut': 0x176E85,
        'american-graphite': 0x19788C, 'american-burgundy': 0x722B37,
        'chinese-ebony': 0x176B7A, 'chinese-ivory': 0x5FC3D3,
        'chinese-jade': 0x176044, 'chinese-violet': 0x593D72,
    }
    color = next((value for name, value in palette.items() if ASSET_ID.endswith(name)), 0x16798D)
    rgb = ((color >> 16 & 255) / 255, (color >> 8 & 255) / 255, (color & 255) / 255)
    image = bpy.data.images.new('Fine woven worsted cloth', width=128, height=128, alpha=False)
    image.colorspace_settings.name = 'sRGB'
    pixels = []
    for y in range(128):
        for x in range(128):
            variation = .965 + .018 * sin(x * pi / 2) + .012 * sin(y * pi / 2)
            pixels.extend((rgb[0] * variation, rgb[1] * variation, rgb[2] * variation, 1))
    image.pixels = pixels
    image.pack()
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = image
    tex.interpolation = 'Linear'
    mapping = nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (20, 30, 1)
    uv = nodes.new('ShaderNodeTexCoord')
    links.new(uv.outputs['UV'], mapping.inputs['Vector'])
    links.new(mapping.outputs['Vector'], tex.inputs['Vector'])
    for link in list(shader.inputs['Base Color'].links):
        links.remove(link)
    links.new(tex.outputs['Color'], shader.inputs['Base Color'])
    material['fineWovenCloth'] = True

def refine_table():
        for scene_object in list(bpy.context.scene.objects):
            bpy.data.objects.remove(scene_object, do_unlink=True)
        bpy.ops.import_scene.gltf(filepath=INPUT_FILE)
        roots = [obj for obj in bpy.context.scene.objects if obj.parent is None]
        meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
        contacts = {}
        bevelled = []
        # Original source mesh_0* nodes contain the cloth, cushions, rails,
        # diamonds and pockets. Keep every vertex, UV and transform exactly.
        # Only the additional cabinet/support models receive small edge bevels.
        for obj in meshes:
            route = obj.get('legacyNode', '')
            safe_cabinet = any(token in route for token in ['table-body/', 'table-details/', 'table-support/'])
            if not safe_cabinet:
                contacts[obj.name] = [tuple(vertex.co) for vertex in obj.data.vertices]
            else:
                bevel = obj.modifiers.new('Cabinet manufactured edge', 'BEVEL')
                # Modifier width uses local coordinates; convert from metres.
                world_scale = max(obj.matrix_world.to_scale())
                bevel.width = min(0.0012 / max(world_scale, 1e-8), min(obj.dimensions) / max(world_scale, 1e-8) * 0.12)
                bevel.segments = 2
                bevel.limit_method = 'ANGLE'
                bevel.affect = 'EDGES'
                bpy.context.view_layer.objects.active = obj
                bpy.ops.object.modifier_apply(modifier=bevel.name)
                bevelled.append(obj.name)
            for material in obj.data.materials:
                if not material or not material.use_nodes:
                    continue
                shader = next((node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED'), None)
                if not shader:
                    continue
                name = material.name.lower()
                if 'cloth' in name or 'cushion' in name:
                    if '-5-' in ASSET_ID and '-snooker-' not in ASSET_ID and name.split('.')[0] == 'cloth':
                        replace_compact_cloth(material, shader)
                    shader.inputs['Roughness'].default_value = 0.86 if 'cloth' in name else 0.73
                    shader.inputs['Metallic'].default_value = 0
                    if 'Sheen Weight' in shader.inputs:
                        shader.inputs['Sheen Weight'].default_value = 0.13
                elif any(token in name for token in ['metal', 'silver', 'brushed']):
                    shader.inputs['Metallic'].default_value = 0.8
                    shader.inputs['Roughness'].default_value = 0.28
                elif 'wood' in name:
                    shader.inputs['Roughness'].default_value = 0.3
                    if 'Coat Weight' in shader.inputs:
                        shader.inputs['Coat Weight'].default_value = 0.3
            obj['nativeRefined'] = True
        # Fine end-grain joinery plates sit below the cabinet edge, completely
        # outside the cloth/pocket envelope. Source Z-up is Blender Z-up after
        # glTF importer conversion, but derive these from actual world bounds.
        bounds = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
        lo = Vector(tuple(min(point[axis] for point in bounds) for axis in range(3)))
        hi = Vector(tuple(max(point[axis] for point in bounds) for axis in range(3)))
        steel = bpy.data.materials.new('Refined cabinet fastener titanium')
        steel.diffuse_color = (0.25, 0.3, 0.32, 1)
        steel.use_nodes = True
        shader = steel.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = steel.diffuse_color
        shader.inputs['Metallic'].default_value = 0.82
        shader.inputs['Roughness'].default_value = 0.25
        added = []
        for sx in [-1, 1]:
            for sy in [-1, 1]:
                x = (lo.x + hi.x) / 2 + sx * (hi.x - lo.x) * 0.34
                y = (lo.y + hi.y) / 2 + sy * (hi.y - lo.y) * 0.497
                z = lo.z + (hi.z - lo.z) * 0.72
                bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.0055, depth=0.003, location=(x, y, z), rotation=(pi / 2, 0, 0))
                bolt = bpy.context.object
                bolt.name = 'Refined recessed cabinet fastener'
                bolt.data.materials.append(steel)
                bolt['nativeRefined'] = True
                # Parenting must preserve the authored world transform.
                matrix = bolt.matrix_world.copy()
                bolt.parent = roots[0]
                bolt.matrix_world = matrix
                added.append(bolt.name)
        for name, positions in contacts.items():
            current = [tuple(vertex.co) for vertex in bpy.data.objects[name].data.vertices]
            if current != positions:
                raise RuntimeError(f'Contact geometry changed: {name}')
        for root in roots:
            root['nativeRefined'] = True
            root['refinementMethod'] = 'MCP Blender cabinet bevels, PBR finish and joinery; contact vertices unchanged'
        bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_ROOT + '/assets/blender/legacy/' + ASSET_ID + '.blend')
        bpy.ops.export_scene.gltf(filepath=OUTPUT_ROOT + '/dist/models/legacy-refined/' + ASSET_ID + '.glb', export_format='GLB', export_extras=True, export_yup=True)
        print('REFINED_TABLE', ASSET_ID, len(bevelled), 'bevelled;', len(contacts), 'contact surfaces unchanged;', len(added), 'fasteners;', 'Blender', bpy.app.version_string)


refine_table()
