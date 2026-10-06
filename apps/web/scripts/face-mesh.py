# Regenerates src/data/face-mesh.ts from MediaPipe's canonical_face_model.obj.
#   curl -LO https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj
#   python3 scripts/face-mesh.py canonical_face_model.obj
import sys
v, vt, tri, uv_of = [], [], [], {}
for line in open(sys.argv[1]):
    p = line.split()
    if not p: continue
    if p[0] == 'v': v.append([float(x) for x in p[1:4]])
    elif p[0] == 'vt': vt.append([float(x) for x in p[1:3]])
    elif p[0] == 'f':
        corners = [tuple(int(n) - 1 for n in c.split('/')[:2]) for c in p[1:]]
        for a, b in corners: uv_of[a] = b
        tri.append([a for a, _ in corners])
assert len(uv_of) == 468
uv = [c for i in range(468) for c in (round(vt[uv_of[i]][0], 5), round(1 - vt[uv_of[i]][1], 5))]
with open('src/data/face-mesh.ts', 'w') as out:
    out.write("""// MediaPipe's canonical face model (google-ai-edge/mediapipe, Apache-2.0:
// mediapipe/modules/face_geometry/data/canonical_face_model.obj), one entry per Face Landmarker
// landmark 0-467. `uv` is the model's texture layout with y pointing down; `triangles` index the
// landmarks; `positions` are the model's 3D vertices in centimetres. Regenerate with
// scripts/face-mesh.py if the model changes.
""")
    out.write(f"export const uv = new Float32Array({uv});\n")
    out.write(f"export const triangles = new Uint16Array({[i for t in tri for i in t]});\n")
    out.write(f"export const positions = new Float32Array({[round(c, 3) for xyz in v for c in xyz]});\n")
