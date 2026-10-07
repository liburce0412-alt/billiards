"""Inspect a saved Blender asset through MCP without changing its source.

Caller binds INPUT_FILE and ASSET_ID. Environment cameras use the same
architectural metre frame as the authored refinements.
"""
import bpy
from mathutils import Vector

bpy.ops.wm.open_mainfile(filepath=INPUT_FILE)
scene = bpy.context.scene
bpy.context.view_layer.update()
for window in bpy.context.window_manager.windows:
    for area in window.screen.areas:
        if area.type == 'VIEW_3D':
            view = area.spaces.active
            view.shading.type = 'MATERIAL'
            view.shading.studiolight_rotate_z = 0
            view.shading.studio_light = 'studio.exr'
            view.overlay.show_overlays = False

if ASSET_ID.startswith('environment-'):
    theme = ASSET_ID.replace('environment-', '')
    architecture = bpy.data.objects[theme + '-architecture']
    members = list(architecture.children_recursive)
    for obj in scene.objects:
        if obj.type == 'MESH' and obj not in members:
            obj.hide_set(True)
    framing = {
        'club': ((1.45, -2.65, 1.15), (3.2, -.55, .1)),
        'spectra': ((-.4, .4, 1.4), (-2, 2.4, .42)),
        'galaxy': ((.8, -.7, 1.1), (2.6, 1.2, .1)),
        'nebula': ((1.5, .1, 1.5), (3.3, 2.1, .45)),
        'aurora-hall': ((1.35, .65, 1.0), (3.2, 2.7, .2)),
        'sky-temple': ((1.3, -2.7, 2.65), (3.25, 0, 1.75)),
        'abyss-palace': ((.7, .5, .8), (2.68, 1.55, -.3)),
        'lunar-observatory': ((-1.05, .5, 1.7), (-2.95, 2.65, .4)),
    }
    frame = bpy.data.objects[theme + '-blender-details'].matrix_world
    eye, target = [frame @ Vector(point) for point in framing[theme]]
    camera = scene.camera
    camera.location = eye
    camera.rotation_euler = (target - eye).to_track_quat('-Z', 'Y').to_euler()
    camera.data.lens = 48
    camera.data.clip_start = .01
    camera.data.clip_end = 200
    scene.render.resolution_x, scene.render.resolution_y = 1400, 1000
    scene.render.resolution_percentage = 100
print('INSPECTION_READY', ASSET_ID)
