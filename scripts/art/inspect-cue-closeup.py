"""Open a final cue for visual inspection without saving or changing its source.

Caller binds INPUT_FILE (.blend or .glb) and VIEW_PART ('grip' or 'tip').
Use Blender MCP's camera/viewport screenshot after this scene setup completes.
"""
import bpy
from mathutils import Vector

if INPUT_FILE.lower().endswith(".blend"):
    bpy.ops.wm.open_mainfile(filepath=INPUT_FILE)
else:
    for scene_object in list(bpy.context.scene.objects):
        bpy.data.objects.remove(scene_object, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=INPUT_FILE)
scene = bpy.context.scene
bpy.context.view_layer.update()
meshes = [obj for obj in scene.objects if obj.type == "MESH"]
if not meshes:
    raise ValueError("Cue scene contains no mesh")


def bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    return Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points))), Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))


minimum, maximum = bounds(meshes)
if maximum.y - minimum.y < 0.8:
    raise ValueError("Expected metre-scale cue along world Y")
if VIEW_PART == "grip":
    parts = [obj for obj in meshes if obj.get("cueRole") in ["wrap", "forearm", "sleeve", "buttCap", "cyberShell", "cyberFrame", "energy", "inlayLight"]]
    if not parts:
        raise ValueError("Cue grip roles not found")
    # Some legacy forearm/inlay role nodes span the whole tapered body.
    # Inspect the actual rear half metre instead of framing their whole mesh.
    span = min(0.5, (maximum.y - minimum.y) * 0.36)
    target = (minimum + maximum) * 0.5
    target.y = minimum.y + span * 0.5
    width = span * 1.14
    direction = Vector((0.88, -0.32, 0.56)).normalized()
elif VIEW_PART == "tip":
    parts = [obj for obj in meshes if obj.get("cueRole") == "tip"]
    if not parts:
        raise ValueError("Cue tip role not found")
    low, high = bounds(parts)
    target = (low + high) * 0.5 - Vector((0, 0.048, 0))
    width = 0.145
    direction = Vector((0.85, 0.22, 0.6)).normalized()
else:
    raise ValueError("VIEW_PART must be grip or tip")

for obj in list(scene.objects):
    if obj.type in ["CAMERA", "LIGHT"]:
        bpy.data.objects.remove(obj, do_unlink=True)
world = bpy.data.worlds.new("Cue close inspection neutral studio")
world.use_nodes = True
world.node_tree.nodes.get("Background").inputs["Color"].default_value = (0.035, 0.045, 0.06, 1)
world.node_tree.nodes.get("Background").inputs["Strength"].default_value = 0.5
scene.world = world
for offset, energy, size in [((0.32, -0.12, 0.35), 22, 0.32), ((-0.24, 0.13, 0.18), 12, 0.24), ((0.05, 0.18, -0.22), 6, 0.18)]:
    data = bpy.data.lights.new("_Review_Softbox", "AREA")
    data.energy, data.size = energy, size
    obj = bpy.data.objects.new("_Review_Softbox", data)
    scene.collection.objects.link(obj)
    obj.location = target + Vector(offset)
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()
data = bpy.data.cameras.new("_Review_CueCloseup")
camera = bpy.data.objects.new("_Review_CueCloseup", data)
scene.collection.objects.link(camera)
camera.location = target + direction * max(0.4, width * 1.7)
camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
data.type = "ORTHO"
data.ortho_scale = width
data.clip_start, data.clip_end = 0.001, 10
scene.camera = camera
scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
scene.render.resolution_percentage = 100
scene.render.engine = "CYCLES"
scene.cycles.samples = 48
scene.view_settings.view_transform = "AgX"
for window in bpy.context.window_manager.windows:
    for area in window.screen.areas:
        if area.type == "VIEW_3D":
            view = area.spaces.active
            view.region_3d.view_perspective = "CAMERA"
            view.region_3d.view_camera_zoom = 0
            view.shading.type = "MATERIAL"
            view.overlay.show_overlays = False
bpy.ops.object.select_all(action="DESELECT")
scene["inspection_part"] = VIEW_PART
scene["inspection_source"] = INPUT_FILE
scene["inspection_framing_width_m"] = width
print("CUE_CLOSEUP_READY", VIEW_PART, "WIDTH_M", width, "TARGET", list(target))
