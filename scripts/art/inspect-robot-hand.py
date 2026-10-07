"""Review the authored thumb/finger articulation through Blender MCP.

Caller binds INPUT_FILE. Inspection only; this script never saves the source.
"""
import bpy

bpy.ops.wm.open_mainfile(filepath=INPUT_FILE)
rig = bpy.data.objects['RobotPlayer']
rig.animation_data.action = bpy.data.actions['Ready']
bpy.context.scene.frame_set(17)
bpy.context.view_layer.update()
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        obj.hide_set(not obj.name.startswith('HandR_'))
for window in bpy.context.window_manager.windows:
    for area in window.screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.shading.studio_light = 'studio.exr'
            area.spaces.active.overlay.show_overlays = False
print('HAND_REVIEW_READY', len(rig.data.bones), 'bones')
