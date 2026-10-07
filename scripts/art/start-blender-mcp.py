"""Run once inside an interactive Blender to enable the local MCP add-on."""
import bpy
import os
import shutil
import sys

tool_root = os.environ.get("BREAK_BUILDER_TOOLS", "D:/DevTools/BreakBuilderNative")
addon_dir = bpy.utils.user_resource("SCRIPTS", path="addons", create=True)
target = os.path.join(addon_dir, "blender_mcp.py")
if os.path.exists(target):
    shutil.copy2(target, target + ".before-break-builder.bak")
shutil.copy2(os.path.join(tool_root, "mcp-for-blender", "addon.py"), target)
if addon_dir not in sys.path:
    sys.path.append(addon_dir)
bpy.ops.preferences.addon_enable(module="blender_mcp")
bpy.context.scene.blendermcp_auto_start_server = True
bpy.context.scene.blendermcp_port = 9876
if hasattr(bpy.context.scene, "blendermcp_telemetry_consent"):
    bpy.context.scene.blendermcp_telemetry_consent = False
bpy.ops.wm.save_userpref()
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            area.spaces.active.shading.type = "MATERIAL"
            area.spaces.active.overlay.show_overlays = False
print("Break Builder: Blender MCP add-on installed; waiting for UI timer startup.")
