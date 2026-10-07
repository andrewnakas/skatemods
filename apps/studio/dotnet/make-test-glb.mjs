// Handcrafted GLB, no deps: a 20x20 m floor at y=0 plus a 4 m wide box ramp (rising to 1.5 m).
// Placed inside stream tile (0,0) (x,z in 0..100) at x,z 40..60. Two materials.
// usage: node make-test-glb.mjs out.glb   (or import { makeTestGlb })
import { writeFileSync } from 'node:fs';

export function makeTestGlb() {
  const prims = [];
  // floor: 2 triangles, normals up
  prims.push({
    material: 0,
    pos: [40,0,40, 60,0,40, 60,0,60, 40,0,60],
    nrm: [0,1,0, 0,1,0, 0,1,0, 0,1,0],
    uv: [0,0, 10,0, 10,10, 0,10],
    idx: [0,2,1, 0,3,2],
  });
  // ramp wedge: x 48..52, z 45..53, height 0 at z=45 to 1.5 at z=53 (flat-shaded faces)
  const A=[48,0,45],B=[52,0,45],C=[52,0,53],D=[48,0,53],E=[52,1.5,53],F=[48,1.5,53];
  const faces = [ [A,F,E,B], [D,C,E,F], [A,D,F], [B,E,C], [A,B,C,D] ];
  const pos=[],nrm=[],uv=[],idx=[];
  for (const f of faces) {
    const [p0,p1,p2] = f;
    const u=[p1[0]-p0[0],p1[1]-p0[1],p1[2]-p0[2]], v=[p2[0]-p0[0],p2[1]-p0[1],p2[2]-p0[2]];
    let n=[u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    const l=Math.hypot(...n)||1; n=n.map(x=>x/l);
    const base=pos.length/3;
    f.forEach((p,i)=>{ pos.push(...p); nrm.push(...n); uv.push(i&1, i>>1); });
    for (let i=1;i<f.length-1;i++) idx.push(base, base+i, base+i+1);
  }
  prims.push({ material: 1, pos, nrm, uv, idx });

  // binary buffer
  const chunks=[]; const views=[]; const accessors=[]; let off=0;
  const add=(arr, Type, target, type, compType, minmax)=>{
    const ta=new Type(arr); const bytes=new Uint8Array(ta.buffer);
    const pad=(4-(bytes.length%4))%4;
    chunks.push(bytes, new Uint8Array(pad));
    views.push({buffer:0, byteOffset:off, byteLength:bytes.length, target});
    off+=bytes.length+pad;
    const acc={bufferView:views.length-1, componentType:compType, count: arr.length/({VEC3:3,VEC2:2,SCALAR:1}[type]), type};
    if (minmax) { const n=3; const mn=[Infinity,Infinity,Infinity], mx=[-Infinity,-Infinity,-Infinity];
      for (let i=0;i<arr.length;i+=n) for(let k=0;k<n;k++){mn[k]=Math.min(mn[k],arr[i+k]);mx[k]=Math.max(mx[k],arr[i+k]);}
      acc.min=mn; acc.max=mx; }
    accessors.push(acc); return accessors.length-1;
  };
  const primitives = prims.map(p=>({
    attributes:{ POSITION: add(p.pos,Float32Array,34962,'VEC3',5126,true), NORMAL: add(p.nrm,Float32Array,34962,'VEC3',5126), TEXCOORD_0: add(p.uv,Float32Array,34962,'VEC2',5126) },
    indices: add(p.idx,Uint16Array,34963,'SCALAR',5123), material: p.material, mode: 4 }));
  const bin=new Uint8Array(off); { let o=0; for (const c of chunks){ bin.set(c,o); o+=c.length; } }
  const gltf={ asset:{version:'2.0', generator:'skatemods smoke'}, scene:0, scenes:[{nodes:[0]}],
    nodes:[{mesh:0, name:'testpark'}], meshes:[{name:'testpark', primitives}],
    materials:[{name:'Concrete', pbrMetallicRoughness:{baseColorFactor:[0.6,0.6,0.6,1], metallicFactor:0, roughnessFactor:1}},
               {name:'Ramp', pbrMetallicRoughness:{baseColorFactor:[0.8,0.4,0.1,1], metallicFactor:0, roughnessFactor:1}}],
    accessors, bufferViews:views, buffers:[{byteLength:bin.length}] };
  let json=new TextEncoder().encode(JSON.stringify(gltf));
  const jpad=(4-(json.length%4))%4; json=Uint8Array.from([...json, ...Array(jpad).fill(0x20)]);
  const total=12+8+json.length+8+bin.length;
  const out=new Uint8Array(total); const dv=new DataView(out.buffer);
  dv.setUint32(0,0x46546C67,true); dv.setUint32(4,2,true); dv.setUint32(8,total,true);
  dv.setUint32(12,json.length,true); dv.setUint32(16,0x4E4F534A,true); out.set(json,20);
  const b=20+json.length; dv.setUint32(b,bin.length,true); dv.setUint32(b+4,0x004E4942,true); out.set(bin,b+8);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(process.argv[2] ?? 'test.glb', makeTestGlb());
}
