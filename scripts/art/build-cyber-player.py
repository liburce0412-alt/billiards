"""Author the shared hard-surface athlete inside Blender, through MCP.

Metres, Z up, forward -Y. Every rigid shell is weighted to an articulated bone.
The generated source is subsequently inspected and refined through MCP look.
"""
import bpy
import math
from mathutils import Vector, Matrix, Euler

# ASSET_ROOT is explicitly supplied by the MCP caller.

for scene_object in list(bpy.context.scene.objects):

    bpy.data.objects.remove(scene_object, do_unlink=True)
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)

def material(name, rgb, metallic=0.0, roughness=0.4, emission=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*rgb, 1)
        bsdf.inputs['Emission Strength'].default_value = emission
    return mat

shell = material('Ceramic titanium / pearl', (.64, .73, .77), .65, .26)
edge = material('Brushed graphite structural frame', (.038, .055, .071), .8, .32)
rubber = material('Flexible joint bellows', (.012, .019, .025), .05, .64)
light = material('Cyan photonic seam', (.015, .7, .9), .35, .22, 2.5)
gold = material('Anodized copper fasteners', (.43, .22, .085), .8, .28)
visor = material('Obsidian optical visor', (.007, .025, .04), .7, .16)
objects = []
bones = {}

def finish(obj, name, mat, bone, bevel=0.0):
    obj.name = name
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Manufactured edge radius', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = 'ANGLE'
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    if obj.type == 'MESH' and bevel:
        normal = obj.modifiers.new('Area weighted normals', 'WEIGHTED_NORMAL')
        normal.keep_sharp = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=normal.name)
    objects.append((obj, bone))
    return obj

def box(name, pos, size, mat, bone, bevel=.008):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, bone, bevel)

def sphere(name, pos, size, mat, bone):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40 if name=='Head_shell' else 20, ring_count=24 if name=='Head_shell' else 12, location=pos)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, bone)

def rod(name, a, b, radius, mat, bone, r2=None):
    a, b = Vector(a), Vector(b)
    delta = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=radius,
        radius2=radius if r2 is None else r2, depth=delta.length, location=(a+b)/2)
    obj = bpy.context.object
    obj.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
    return finish(obj, name, mat, bone, min(.003, radius * .12))

def plate(name, center, width, height, thickness, mat, bone):
    # Deliberate faceted silhouette: broad shoulders, tucked lower edge.
    outline = [(-.34,.5),(.34,.5),(.5,.3),(.44,-.24),(.2,-.5),(-.2,-.5),(-.44,-.24),(-.5,.3)]
    verts = [(x*width, y, z*height) for y in (-thickness/2, thickness/2) for x,z in outline]
    faces = [tuple(range(7,-1,-1)), tuple(range(8,16))]
    faces += [(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = center
    return finish(obj, name, mat, bone, .007)

def bone(name, head, tail, parent=None):
    bones[name] = (head, tail, parent)

bone('Pelvis_joint', (0,0,.91), (0,0,1.08))
bone('Torso_joint', (0,0,1.08), (0,0,1.49), 'Pelvis_joint')
bone('Head_joint', (0,0,1.49), (0,0,1.76), 'Torso_joint')
box('Pelvis_core', (0,.015,.96), (.26,.2,.2), rubber, 'Pelvis_joint', .04)
plate('Pelvis_shield', (0,-.115,.98), .29,.2,.065,shell,'Pelvis_joint')
box('Torso_spine', (0,.07,1.25), (.15,.14,.42), edge,'Torso_joint',.04)
for i in range(4):
    plate('Torso_abdominal_%02d'%i, (0,-.06,1.08+i*.063), .22+i*.022,.072,.065,shell,'Torso_joint')
grip_rest = Matrix.Translation(Vector((-.35, -.102, .855))) @ Matrix.Rotation(math.pi, 4, 'X')

def grip_point(point):
    return grip_rest @ Vector(point)

def grip_hand():
    """A shakehand grip: supported index/thumb, three fingers around the handle.

    Coordinates here are the equipment Paddle frame, not guessed bone angles.
    The paddle is inserted at this exact rest matrix during Blender review.
    """
    palm = box('HandR_palm',grip_point((-.027,.013,.007)),(.05,.036,.087),edge,'HandR_joint',.011)
    palm.rotation_euler = (math.pi,0,0)
    dorsal = plate('HandR_dorsal',grip_point((-.031,.034,.006)),.044,.071,.01,shell,'HandR_joint')
    dorsal.rotation_euler = (math.pi,0,0)
    rod('HandR_palm_heel',grip_point((0,-.012,-.07)),grip_point((-.025,.014,-.02)),.026,edge,'HandR_joint',.021)
    chains = [
        [(-.044,.014,.046),(-.011,.014,.060),(.020,.013,.068),(.042,.012,.071)],
        [(-.042,.018,.024),(-.004,.026,.024),(.025,.013,.023),(.023,-.016,.022)],
        [(-.043,.018,.002),(-.004,.026,.002),(.025,.013,.001),(.023,-.016,0)],
        [(-.041,.016,-.020),(-.005,.024,-.020),(.024,.012,-.021),(.021,-.015,-.022)],
    ]
    for digit,points in enumerate(chains):
        previous='HandR_joint'
        for segment in range(3):
            key='FingerR%d%d_joint'%(digit,segment)
            a,b=grip_point(points[segment]),grip_point(points[segment+1])
            bone(key,a,b,previous)
            rod('HandR_finger_%d_%d'%(digit,segment),a,b,.0075 if segment<2 else .0065,shell,key)
            sphere('HandR_knuckle_%d_%d'%(digit,segment),a,(.0085,.0085,.0085),edge,key)
            previous=key
    thumb=[(-.041,-.009,.015),(-.029,-.018,.043),(-.005,-.015,.061),(.018,-.013,.065)]
    previous='HandR_joint'
    for segment in range(3):
        key='ThumbR%d_joint'%segment
        a,b=grip_point(thumb[segment]),grip_point(thumb[segment+1])
        bone(key,a,b,previous)
        rod('HandR_thumb_%d'%segment,a,b,.009-segment*.001,shell,key)
        sphere('HandR_thumb_joint%d'%segment,a,(.01,.01,.01),edge,key)
        previous=key

for s in (-1,1):
    side = 'L' if s>0 else 'R'
    plate('Torso_pectoral_'+side, (s*.105,-.095,1.405),.225,.225,.13,shell,'Torso_joint')
    box('Torso_seam_'+side,(s*.09,-.166,1.45),(.125,.006,.009),light,'Torso_joint',.002)
    plate('Torso_back_'+side,(s*.102,.119,1.39),.19,.25,.045,edge,'Torso_joint')
    for i in range(4):
        box('Torso_vent_%s_%d'%(side,i),(s*.11,-.162,1.35-i*.018),(.064,.009,.008),rubber,'Torso_joint',.002)
    for z in (1.34,1.48):
        rod('Torso_fastener_'+side,(s*.175,-.17,z),(s*.175,-.179,z),.0055,gold,'Torso_joint')
plate('Torso_sternum',(0,-.181,1.416),.042,.125,.018,edge,'Torso_joint')
plate('Torso_reactor',(0,-.194,1.425),.018,.063,.008,light,'Torso_joint')
rod('Head_neck',(0,0,1.49),(0,0,1.585),.047,edge,'Head_joint')
for z in (1.52,1.545,1.57):
    rod('Head_neck_ring',(0,0,z),(0,0,z+.009),.056,shell,'Head_joint')
sphere('Head_shell',(0,0,1.69),(.112,.103,.137),shell,'Head_joint')
sphere('Head_visor',(0,-.087,1.704),(.096,.029,.044),visor,'Head_joint')
for s in (-1,1):
    side='L' if s>0 else 'R'
    obj=box('Head_optic_'+side,(s*.044,-.117,1.711),(.076,.007,.007),light,'Head_joint',.003)
    obj.rotation_euler[1]=s*.065
    plate('Head_cheek_'+side,(s*.075,-.075,1.634),.067,.081,.052,edge,'Head_joint')
    rod('Head_receiver_'+side,(s*.106,0,1.7),(s*.128,0,1.7),.036,edge,'Head_joint')
    rod('Head_receiver_ring_'+side,(s*.129,0,1.7),(s*.133,0,1.7),.026,gold,'Head_joint')
plate('Head_chin',(0,-.089,1.604),.092,.044,.032,shell,'Head_joint')
box('Head_crown',(0,-.004,1.823),(.015,.096,.007),light,'Head_joint',.003)
plate('Head_occipital',(0,.092,1.677),.145,.15,.025,edge,'Head_joint')
box('Head_rear_status',(0,.108,1.695),(.067,.008,.005),light,'Head_joint',.002)
plate('Torso_lumbar_cover',(0,.092,1.173),.19,.17,.042,edge,'Torso_joint')
for s in (-1,1):
    plate('Torso_rib_guard',(s*.128,.021,1.257),.08,.18,.15,edge,'Torso_joint')
    box('Torso_clavicle',(s*.116,-.035,1.52),(.19,.15,.022),edge,'Torso_joint',.007)

for s in (-1,1):
    side='L' if s>0 else 'R'
    shoulder=(s*.27,0,1.44); elbow=(s*.34,-.018,1.16); wrist=(s*.35,-.09,.925)
    hand=(s*.35,-.107,.835)
    bone('UpperArm'+side+'_joint',shoulder,elbow,'Torso_joint')
    bone('Forearm'+side+'_joint',elbow,wrist,'UpperArm'+side+'_joint')
    bone('Hand'+side+'_joint',wrist,hand,'Forearm'+side+'_joint')
    sphere('UpperArm'+side+'_bearing',shoulder,(.09,.085,.085),rubber,'UpperArm'+side+'_joint')
    plate('UpperArm'+side+'_pauldron',(s*.277,-.015,1.458),.18,.165,.17,shell,'UpperArm'+side+'_joint')
    rod('UpperArm'+side+'_inner',shoulder,elbow,.053,edge,'UpperArm'+side+'_joint',.044)
    plate('UpperArm'+side+'_shell',(s*.315,-.055,1.305),.108,.19,.077,shell,'UpperArm'+side+'_joint')
    sphere('Forearm'+side+'_bearing',elbow,(.059,.056,.055),rubber,'Forearm'+side+'_joint')
    rod('Forearm'+side+'_pivot',(s*.29,-.018,1.16),(s*.395,-.018,1.16),.029,gold,'Forearm'+side+'_joint')
    rod('Forearm'+side+'_inner',elbow,wrist,.043,edge,'Forearm'+side+'_joint',.031)
    plate('Forearm'+side+'_shell',(s*.348,-.082,1.046),.107,.177,.074,shell,'Forearm'+side+'_joint')
    box('Forearm'+side+'_light',(s*.348,-.123,1.057),(.007,.007,.106),light,'Forearm'+side+'_joint',.002)
    rod('Forearm'+side+'_hydraulic',(s*.38,.012,1.125),(s*.39,-.044,.97),.009,gold,'Forearm'+side+'_joint')
    sphere('Hand'+side+'_wrist',wrist,(.033,.032,.03),rubber,'Hand'+side+'_joint')
    if side == 'R':
        grip_hand()
    else:
        box('Hand'+side+'_palm',(s*.35,-.108,.875),(.086,.041,.09),edge,'Hand'+side+'_joint',.012)
        plate('Hand'+side+'_dorsal',(s*.35,-.133,.886),.073,.069,.015,shell,'Hand'+side+'_joint')
    # Four independent finger chains, with a thumb on the medial palm side.
    for digit in (range(4) if side == 'L' else []):
        fx=s*.35+(digit-1.5)*.021
        start=Vector((fx,-.109,.835))
        previous='Hand'+side+'_joint'
        for segment,length in enumerate((.026,.022,.018)):
            end=start+Vector((0,0,-length))
            key='Finger%s%d%d_joint'%(side,digit,segment)
            bone(key,tuple(start),tuple(end),previous)
            rod('Hand%s_finger_%d_%d'%(side,digit,segment),start,end,.0085 if segment<2 else .007,shell,key)
            sphere('Hand%s_knuckle_%d_%d'%(side,digit,segment),start,(.0095,.0095,.0095),edge,key)
            start=end;previous=key
    thumb=[(.315,-.106,.896),(.282,-.108,.882),(.269,-.109,.858),(.267,-.109,.835)]
    previous='Hand'+side+'_joint'
    for segment in (range(3) if side == 'L' else []):
        key='Thumb%s%d_joint'%(side,segment)
        bone(key,thumb[segment],thumb[segment+1],previous)
        rod('Hand%s_thumb_%d'%(side,segment),thumb[segment],thumb[segment+1],.010-segment*.001,shell,key)
        sphere('Hand%s_thumb_joint%d'%(side,segment),thumb[segment],(.011,.011,.011),edge,key)
        previous=key
    hip=(s*.105,0,.96); knee=(s*.14,-.025,.54); ankle=(s*.15,.012,.12)
    bone('Thigh'+side+'_joint',hip,knee,'Pelvis_joint')
    bone('Shin'+side+'_joint',knee,ankle,'Thigh'+side+'_joint')
    bone('Foot'+side+'_joint',ankle,(s*.15,-.16,.07),'Shin'+side+'_joint')
    rod('Thigh'+side+'_frame',hip,knee,.067,edge,'Thigh'+side+'_joint',.047)
    plate('Thigh'+side+'_shell',(s*.124,-.057,.744),.155,.3,.11,shell,'Thigh'+side+'_joint')
    plate('Thigh'+side+'_rear',(s*.124,.053,.755),.117,.23,.048,edge,'Thigh'+side+'_joint')
    sphere('Shin'+side+'_knee',knee,(.07,.064,.065),rubber,'Shin'+side+'_joint')
    plate('Shin'+side+'_kneecap',(s*.14,-.088,.547),.125,.12,.053,edge,'Shin'+side+'_joint')
    rod('Shin'+side+'_frame',knee,ankle,.046,edge,'Shin'+side+'_joint',.031)
    plate('Shin'+side+'_shell',(s*.147,-.045,.329),.115,.3,.07,shell,'Shin'+side+'_joint')
    plate('Shin'+side+'_calf',(s*.145,.051,.35),.093,.22,.045,edge,'Shin'+side+'_joint')
    box('Shin'+side+'_seam',(s*.147,-.085,.349),(.009,.006,.13),light,'Shin'+side+'_joint',.002)
    box('Foot'+side+'_sole',(s*.15,-.058,.039),(.127,.265,.043),rubber,'Foot'+side+'_joint',.016)
    box('Foot'+side+'_shell',(s*.15,-.058,.084),(.123,.249,.083),shell,'Foot'+side+'_joint',.029)
    for step in range(3):
        box('Foot'+side+'_tread%d'%step,(s*.15,-.12+step*.048,.124),(.103,.009,.006),edge,'Foot'+side+'_joint',.002)

arm_data=bpy.data.armatures.new('AthleteSkeleton')
rig=bpy.data.objects.new('RobotPlayer',arm_data)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name,(head,tail,parent) in bones.items():
    eb=arm_data.edit_bones.new(name);eb.head=head;eb.tail=tail
    if parent: eb.parent=arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
for obj,key in objects:
    obj.parent=rig
    vg=obj.vertex_groups.new(name=key)
    vg.add(list(range(len(obj.data.vertices))),1.0,'REPLACE')
    mod=obj.modifiers.new('Rigid exoskeleton articulation','ARMATURE');mod.object=rig

# Batch by semantic region, preserving the first-person arm visibility contract.
# Joining keeps individual finger vertex groups and the shared armature modifier.
# The right elbow bearing/pivot stay separate so the camera can hide them.
regions=['Pelvis','Torso','Head','UpperArmL','UpperArmR','ForearmL','ForearmR','HandL','HandR','ThighL','ThighR','ShinL','ShinR','FootL','FootR']
keep_separate=['ForearmR_bearing','ForearmR_pivot']
region_groups=[(region,[obj for obj,key in objects if obj.name.startswith(region+'_') and obj.name not in keep_separate]) for region in regions]
for region,parts in region_groups:
    if not parts:
        raise ValueError('Missing robot semantic region: '+region)
    expected_groups=set()
    for obj in parts:
        for group in obj.vertex_groups:
            expected_groups.add(group.name)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts: obj.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    if len(parts)>1: bpy.ops.object.join()
    joined=parts[0]
    joined.name=region+'_native_batch'
    joined['semanticRegion']=region
    joined['sourceMeshCount']=len(parts)
    actual_groups=set(group.name for group in joined.vertex_groups)
    if not expected_groups.issubset(actual_groups):
        raise ValueError('Batching lost finger or region skin weights: '+region)
rig['semanticMeshCount']=len(regions)+len(keep_separate)
for s in (-1,1):
    side='L' if s>0 else 'R'
    socket=bpy.data.objects.new('Grip'+side,None)
    bpy.context.collection.objects.link(socket)
    socket.parent=rig;socket.parent_type='BONE';socket.parent_bone='Hand'+side+'_joint'
    if side == 'R':
        socket.matrix_world=grip_rest
    else:
        socket.location=(0,.022,.012)
    socket['equipment_pose']='Paddle attached with identity transform; blade +Z/front -Y Blender'
palm_rest = Matrix.Translation(Vector((.35,-.084,.867))) @ Matrix.Rotation(-math.pi/2,4,'X')
for name in ['PalmL','BallHoldL']:
    socket=bpy.data.objects.new(name,None)
    bpy.context.collection.objects.link(socket)
    socket.parent=rig;socket.parent_type='BONE';socket.parent_bone='HandL_joint'
    socket.matrix_world=palm_rest
    socket['surface_normal']='Node local +Z Blender / +Y glTF; bare palm surface without ball radius'

def pose_segment(name, head, tail):
    """Place a rigid leg segment in armature space, retaining its rest roll."""
    rest=rig.data.bones[name]
    rotation=(rest.tail_local-rest.head_local).rotation_difference(tail-head)
    matrix=rotation.to_matrix().to_4x4() @ rest.matrix_local
    matrix.translation=head
    rig.pose.bones[name].matrix=matrix
    bpy.context.view_layer.update()

def athletic_stance(drop, t, stepping):
    # Lower the pelvis, then solve the knees from fixed ankle positions. Moving
    # the complete character down would bury the feet and is intentionally not
    # used. The forward knee pole is Blender -Y, matching the athlete's facing.
    shift=Vector((.018*math.sin(t*math.tau) if stepping else 0,.022,-drop))
    pelvis=rig.data.bones['Pelvis_joint'].matrix_local.copy()
    pelvis.translation=pelvis.translation+shift
    rig.pose.bones['Pelvis_joint'].matrix=pelvis
    bpy.context.view_layer.update()
    for side,phase in [('L',0),('R',math.pi)]:
        thigh=rig.data.bones['Thigh'+side+'_joint']
        shin=rig.data.bones['Shin'+side+'_joint']
        foot=rig.data.bones['Foot'+side+'_joint']
        lift=max(0,math.sin(t*math.tau+phase))*.026 if stepping else 0
        foot_shift=Vector((0,0,lift))
        hip=thigh.head_local+shift
        ankle=shin.tail_local+foot_shift
        upper=(thigh.tail_local-thigh.head_local).length
        lower=(shin.tail_local-shin.head_local).length
        line=ankle-hip
        distance=line.length
        direction=line.normalized()
        along=(upper*upper-lower*lower+distance*distance)/(2*distance)
        height=math.sqrt(max(0,upper*upper-along*along))
        pole=Vector((0,-1,0))
        bend=(pole-direction*pole.dot(direction)).normalized()
        knee=hip+direction*along+bend*height
        pose_segment('Thigh'+side+'_joint',hip,knee)
        pose_segment('Shin'+side+'_joint',knee,ankle)
        # Ankle orientation stays neutral instead of pitching soles with shins.
        foot_matrix=foot.matrix_local.copy()
        foot_matrix.translation=foot_matrix.translation+foot_shift
        rig.pose.bones['Foot'+side+'_joint'].matrix=foot_matrix
        bpy.context.view_layer.update()
        if abs(rig.pose.bones['Foot'+side+'_joint'].head.z-ankle.z)>.00001:
            raise ValueError('Athletic stance changed the planted ankle height')

def place_arm(side, target_matrix):
    """Authored elbow pole and fixed segment lengths, not hand teleportation."""
    upper=rig.data.bones['UpperArm'+side+'_joint']
    lower=rig.data.bones['Forearm'+side+'_joint']
    shoulder=rig.pose.bones['UpperArm'+side+'_joint'].head.copy()
    target=target_matrix.translation.copy()
    a=(upper.tail_local-upper.head_local).length
    b=(lower.tail_local-lower.head_local).length
    delta=target-shoulder
    distance=min(a+b-.008,max(abs(a-b)+.008,delta.length))
    direction=delta.normalized()
    target=shoulder+direction*distance
    along=(a*a-b*b+distance*distance)/(2*distance)
    height=math.sqrt(max(0,a*a-along*along))
    pole=Vector((-1 if side=='R' else 1,.18,-.35))
    bend=(pole-direction*pole.dot(direction)).normalized()
    elbow=shoulder+direction*along+bend*height
    pose_segment('UpperArm'+side+'_joint',shoulder,elbow)
    pose_segment('Forearm'+side+'_joint',elbow,target)
    hand=target_matrix.copy();hand.translation=target
    rig.pose.bones['Hand'+side+'_joint'].matrix=hand
    bpy.context.view_layer.update()


def pose_at(keys, t):
    for index in range(len(keys)-1):
        begin,end=keys[index],keys[index+1]
        if t<=end[0]:
            u=max(0,min(1,(t-begin[0])/(end[0]-begin[0])))
            u=u*u*(3-2*u)
            return tuple(begin[1][axis]*(1-u)+end[1][axis]*u for axis in range(len(begin[1])))
    return keys[-1][1]


ready=(-.16,-.39,1.16,-.08,-.22,-.12,0)
strokes={
    'Forehand': [(0,ready),(.25,(-.41,-.18,1.06,-.18,-.28,-.32,-.28)),(.5,(-.29,-.46,1.16,-.18,-.20,.02,.03)),(.73,(-.025,-.37,1.39,-.10,-.30,.32,.28)),(1,ready)],
    'Backhand': [(0,ready),(.25,(.015,-.29,1.16,.08,.24,.22,.12)),(.5,(-.08,-.41,1.18,-.16,.18,-.04,-.04)),(.73,(-.31,-.43,1.34,-.15,.05,-.28,-.16)),(1,ready)],
    'Serve': [(0,(-.38,-.17,1.08,.28,-.20,-.25,-.22)),(.25,(-.37,-.22,1.09,.30,-.12,-.22,-.20)),(.5,(-.20,-.43,1.14,.10,-.15,.02,0)),(.73,(-.035,-.38,1.31,-.15,-.20,.23,.18)),(1,ready)],
}
rig.animation_data_create()
for name in ('Idle','Ready','ServeHold','ServeToss','Forehand','Backhand','Serve','Recover','StepLeft','StepRight'):
    action=bpy.data.actions.new(name);rig.animation_data.action=action
    for frame in (1,5,9,13,17,21,25,29,33):
        t=(frame-1)/32
        swing=math.sin(math.pi*t)**2
        for pb in rig.pose.bones:
            pb.rotation_mode='XYZ';pb.rotation_euler=(0,0,0);pb.location=(0,0,0)
        if name!='Idle':
            athletic_stance(.08+.006*swing if name in ('Forehand','Backhand','Serve') else .08,t,name.startswith('Step'))
            values=pose_at(strokes[name],t) if name in strokes else ready
            if name in ('ServeHold','ServeToss'):
                values=(-.37,-.18,1.08,.28,-.20,-.25,-.20)
            # Bone local Y follows the spine. Turning about local Z rolls the
            # athlete sideways instead of rotating the shoulders toward the ball.
            rig.pose.bones['Torso_joint'].rotation_euler=(.16,values[6],0)
            bpy.context.view_layer.update()
            grip_pose=Matrix.Translation(Vector(values[:3])) @ Euler(values[3:6],'XYZ').to_matrix().to_4x4()
            hand_pose=grip_pose @ grip_rest.inverted() @ rig.data.bones['HandR_joint'].matrix_local
            place_arm('R',hand_pose)
            palm_position=(.17,-.30,1.15)
            if name=='ServeHold':
                palm_position=(.14,-.37,1.09)
            elif name=='ServeToss':
                palm_position=pose_at([(0,(.14,-.37,1.09)),(.32,(.14,-.37,1.27)),(.65,(.21,-.28,1.13)),(1,(.22,-.24,1.13))],t)
            elif name=='Serve':
                palm_position=(.23,-.23,1.12)
            # Face the open fingers away from the wrist/toward the table.
            # A palm-up normal alone left the serving hand reversed in-game.
            palm_pose=Matrix.Translation(Vector(palm_position)) @ Matrix.Rotation(math.pi,4,'Z')
            place_arm('L',palm_pose @ palm_rest.inverted() @ rig.data.bones['HandL_joint'].matrix_local)
        for pb in rig.pose.bones:
            pb.keyframe_insert(data_path='rotation_euler',frame=frame,group=pb.name)
            pb.keyframe_insert(data_path='location',frame=frame,group=pb.name)
    track=rig.animation_data.nla_tracks.new();track.name=name
    strip=track.strips.new(name,1,action);track.mute=True
rig.animation_data.action=None
for pb in rig.pose.bones:
    pb.rotation_euler=(0,0,0);pb.location=(0,0,0)
rig['stance_note']='Ready and stroke clips lower pelvis 8cm with two-bone knee solve and planted feet'
rig['grip_note']='Standard shakehand: supported index and thumb on opposite blade faces; three fingers relaxed around handle'
rig['stroke_contact_normalized']=.5
rig['serve_toss_release_normalized']=.32
bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=33
bpy.context.scene.render.fps=30
bpy.context.scene.world.color=(.13,.15,.19)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True);bpy.context.view_layer.objects.active=rig
for window in bpy.context.window_manager.windows:
    for area in window.screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_location=(0,0,.92)
            area.spaces.active.region_3d.view_distance=2.8
            area.spaces.active.shading.type='MATERIAL'
            area.spaces.active.overlay.show_overlays=False
bpy.ops.wm.save_as_mainfile(filepath=ASSET_ROOT+'/sources/robot-player.blend')
bpy.ops.export_scene.gltf(filepath=ASSET_ROOT+'/models/robot-player.glb',export_format='GLB',export_animation_mode='ACTIONS',export_apply=False,export_extras=True)
print('Athlete sample exported',sum(1 for obj in bpy.context.scene.objects if obj.type=='MESH'),'semantic meshes',len(bones),'bones')
