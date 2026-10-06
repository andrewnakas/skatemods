// What /face/ does with a camera frame, all on the phone: skin tone, hair colour and style,
// facial hair, and a face texture unwrapped into MediaPipe's canonical face layout.
// Only these derived results are uploaded; frames never leave the device.
import { uv, triangles, positions } from '../data/face-mesh';

export type Point = { x: number; y: number; z?: number };
export type Rgb = [number, number, number];

// selfie_multiclass_256x256 categories.
export const SEG = { background: 0, hair: 1, bodySkin: 2, faceSkin: 3, clothes: 4, other: 5 } as const;

// Face Landmarker indices used here.
const L = {
  forehead: 10, chin: 152, nose: 1, left: 234, right: 454, mouthTop: 13, mouthBottom: 14,
  upperLip: 0, mouthLeft: 61, mouthRight: 291, noseBottom: 2,
};
// The face's outline, in order (FACEMESH_FACE_OVAL).
export const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
  148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
/** -0.5 (turned fully one way) to 0.5 (the other); about 0 looking straight at the camera. */
export function yaw(lm: Point[]): number {
  const left = lm[L.left].x, right = lm[L.right].x;
  return (lm[L.nose].x - left) / (right - left || 1) - 0.5;
}

/** The face's height as a share of the frame's. */
export function faceSize(lm: Point[]): number {
  return Math.abs(lm[L.chin].y - lm[L.forehead].y);
}

const toLinear = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const toSrgb = (c: number) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)));
export const hex = (c: Rgb) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
export const fromHex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function inside(poly: Point[], x: number, y: number) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/**
 * The typical colour of a set of pixels: the per-channel median of the middle half by
 * brightness (no specular highlights, no deep shadow). A median, not a mean: a mean in linear
 * light leans towards the brighter pixels and reads skin too light.
 */
function typical(samples: Rgb[]): Rgb | null {
  if (samples.length < 30) return null;
  const sorted = samples.map((s) => ({ s, l: luma(s[0], s[1], s[2]) })).sort((a, b) => a.l - b.l);
  const mid = sorted.slice(Math.floor(sorted.length * 0.25), Math.ceil(sorted.length * 0.75));
  return [0, 1, 2].map((c) => {
    const values = mid.map(({ s }) => s[c]).sort((a, b) => a - b);
    return values[values.length >> 1];
  }) as Rgb;
}

export interface Frame {
  /** RGBA pixels of the captured frame. */
  image: ImageData;
  /** Landmarks normalised to the frame. */
  landmarks: Point[];
  /** One category per pixel of `mask` (SEG), maskWidth x maskHeight, stretched over the frame. */
  mask: Uint8Array;
  maskWidth: number;
  maskHeight: number;
}

function category(f: Frame, x: number, y: number) {
  const mx = Math.min(f.maskWidth - 1, Math.floor(x * f.maskWidth)), my = Math.min(f.maskHeight - 1, Math.floor(y * f.maskHeight));
  return f.mask[my * f.maskWidth + mx];
}
function pixel(f: Frame, x: number, y: number): Rgb {
  const px = Math.min(f.image.width - 1, Math.floor(x * f.image.width)), py = Math.min(f.image.height - 1, Math.floor(y * f.image.height));
  const i = (py * f.image.width + px) * 4, d = f.image.data;
  return [d[i], d[i + 1], d[i + 2]];
}

export type HairStyle = 'bald' | 'buzz' | 'short' | 'medium' | 'long' | 'tall';
export type FacialHair = 'none' | 'stubble' | 'mustache' | 'beard';
export interface Analysis {
  skin: Rgb;
  hair: Rgb;
  hairStyle: HairStyle;
  facialHair: FacialHair;
  /** What the guesses were based on, for the page to show. */
  notes: string[];
}

export function analyse(f: Frame): Analysis {
  const lm = f.landmarks;
  const notes: string[] = [];
  const step = 1 / 256;

  // Skin: every face-skin pixel inside the face's outline. (Cheek and forehead patches alone
  // read a studio portrait about 25 levels too light: they are where the light falls.)
  const skinSamples: Rgb[] = [];
  const outline = OVAL.map((i) => lm[i]);
  const ox = outline.map((p) => p.x), oy = outline.map((p) => p.y);
  for (let y = Math.min(...oy); y <= Math.max(...oy); y += step / 2)
    for (let x = Math.min(...ox); x <= Math.max(...ox); x += step / 2)
      if (inside(outline, x, y) && category(f, x, y) === SEG.faceSkin) skinSamples.push(pixel(f, x, y));
  const skin = typical(skinSamples) ?? [198, 140, 110];
  if (skinSamples.length < 30) notes.push('Not enough clear skin for a reading. Check the lighting.');

  // Hair: every hair pixel in a box around the head.
  const top = lm[L.forehead].y, chin = lm[L.chin].y, height = chin - top;
  const left = lm[L.left].x, right = lm[L.right].x, width = right - left;
  const box = { x0: left - width * 0.6, x1: right + width * 0.6, y0: top - height * 0.9, y1: chin + height * 1.2 };
  const hairSamples: Rgb[] = [];
  let hairTop = Infinity, hairBottom = -Infinity, above = 0, aboveTotal = 0;
  for (let y = Math.max(0, box.y0); y <= Math.min(1, box.y1); y += step)
    for (let x = Math.max(0, box.x0); x <= Math.min(1, box.x1); x += step) {
      const isHair = category(f, x, y) === SEG.hair;
      if (y < top && x > left && x < right) { aboveTotal++; if (isHair) above++; }
      if (!isHair) continue;
      hairSamples.push(pixel(f, x, y));
      // Hair beside the face counts for length, not a beard under the chin.
      if (x < left + width * 0.15 || x > right - width * 0.15 || y < lm[L.mouthTop].y) {
        hairTop = Math.min(hairTop, y);
        hairBottom = Math.max(hairBottom, y);
      }
    }
  const hair = typical(hairSamples) ?? [40, 30, 22];
  const crown = aboveTotal ? above / aboveTotal : 0;
  const thickness = Number.isFinite(hairTop) ? (top - hairTop) / height : 0;
  const reach = Number.isFinite(hairBottom) ? (hairBottom - chin) / height : -1;
  let hairStyle: HairStyle;
  if (crown < 0.08) hairStyle = 'bald';
  else if (thickness < 0.08) hairStyle = 'buzz';
  else if (thickness > 0.45) hairStyle = 'tall';
  else if (reach > 0.3) hairStyle = 'long';
  else if (hairBottom > lm[L.mouthTop].y) hairStyle = 'medium';
  else hairStyle = 'short';
  notes.push(`Hair height ${Math.round(thickness * 100)}% of the face, reaching ${reach > 0 ? Math.round(reach * 100) + '% below the chin' : 'above the chin'}.`);

  // Facial hair: hair pixels on the chin and over the top lip.
  const share = (poly: Point[]) => {
    let n = 0, h = 0;
    const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += step / 2)
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += step / 2)
        if (inside(poly, x, y)) { n++; if (category(f, x, y) === SEG.hair) h++; }
    return n ? h / n : 0;
  };
  const chinShare = share([61, 291, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172].map((i) => lm[i]));
  const lipShare = share([L.mouthLeft, L.noseBottom, L.mouthRight, L.upperLip].map((i) => lm[i]));
  const facialHair: FacialHair = chinShare > 0.3 ? 'beard' : lipShare > 0.3 ? 'mustache' : chinShare > 0.08 ? 'stubble' : 'none';

  return { skin, hair, hairStyle, facialHair, notes };
}

// ---- face texture ----------------------------------------------------------------------

function shader(gl: WebGLRenderingContext, type: number, source: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
  return s;
}
function program(gl: WebGLRenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'program');
  return p;
}
function buffer(gl: WebGLRenderingContext, data: Float32Array | Uint16Array, target: number = gl.ARRAY_BUFFER) {
  const b = gl.createBuffer()!;
  gl.bindBuffer(target, b);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  return b;
}
function texture(gl: WebGLRenderingContext, source: TexImageSource) {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  return t;
}

/**
 * The face from `frame`, unwrapped into the canonical face model's texture layout (`size`
 * square), over the skin tone, with soft edges and the camera's broad shading evened out.
 */
export function unwrap(frame: Frame, skin: Rgb, size = 1024): HTMLCanvasElement {
  const glCanvas = document.createElement('canvas');
  glCanvas.width = glCanvas.height = size;
  const gl = glCanvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true })!;
  if (!gl) throw new Error('This browser has no WebGL.');
  const p = program(gl,
    `attribute vec2 a_uv; attribute vec2 a_src; varying vec2 v_src;
     void main() { v_src = a_src; gl_Position = vec4(a_uv.x * 2.0 - 1.0, 1.0 - a_uv.y * 2.0, 0.0, 1.0); }`,
    `precision mediump float; uniform sampler2D u_image; varying vec2 v_src;
     void main() { gl_FragColor = texture2D(u_image, v_src); }`);
  gl.useProgram(p);
  const src = new Float32Array(468 * 2);
  frame.landmarks.slice(0, 468).forEach((pt, i) => { src[i * 2] = pt.x; src[i * 2 + 1] = pt.y; });
  const bind = (name: string, data: Float32Array) => {
    buffer(gl, data);
    const loc = gl.getAttribLocation(p, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  };
  bind('a_uv', uv);
  bind('a_src', src);
  buffer(gl, triangles, gl.ELEMENT_ARRAY_BUFFER);
  const source = document.createElement('canvas');
  source.width = frame.image.width;
  source.height = frame.image.height;
  source.getContext('2d')!.putImageData(frame.image, 0, 0);
  texture(gl, source);
  gl.viewport(0, 0, size, size);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawElements(gl.TRIANGLES, triangles.length, gl.UNSIGNED_SHORT, 0);

  // Even out the light: divide by a heavy blur of the face, then scale back to the skin tone.
  const face = document.createElement('canvas');
  face.width = face.height = size;
  const fc = face.getContext('2d', { willReadFrequently: true })!;
  fc.drawImage(glCanvas, 0, 0);
  const blur = document.createElement('canvas');
  blur.width = blur.height = size;
  const bc = blur.getContext('2d', { willReadFrequently: true })!;
  bc.fillStyle = hex(skin);
  bc.fillRect(0, 0, size, size);
  bc.filter = `blur(${Math.round(size / 24)}px)`;
  bc.drawImage(face, 0, 0);
  const pixels = fc.getImageData(0, 0, size, size), low = bc.getImageData(0, 0, size, size).data;
  const target = luma(...skin.map(toLinear) as Rgb);
  for (let i = 0; i < pixels.data.length; i += 4) {
    if (!pixels.data[i + 3]) continue;
    const around = luma(toLinear(low[i]), toLinear(low[i + 1]), toLinear(low[i + 2])) || 1e-3;
    const gain = Math.min(2.5, Math.max(0.4, (target / around) ** 0.75));
    for (let c = 0; c < 3; c++) pixels.data[i + c] = toSrgb(toLinear(pixels.data[i + c]) * gain);
  }
  fc.putImageData(pixels, 0, 0);

  // Soft edges: the face's own coverage, blurred, cuts it out over the skin tone.
  const feather = document.createElement('canvas');
  feather.width = feather.height = size;
  const xc = feather.getContext('2d')!;
  xc.filter = `blur(${Math.round(size / 64)}px)`;
  xc.drawImage(glCanvas, 0, 0);
  xc.filter = 'none';
  xc.globalCompositeOperation = 'source-in';
  xc.drawImage(face, 0, 0);

  const out = document.createElement('canvas');
  out.width = out.height = size;
  const oc = out.getContext('2d')!;
  oc.fillStyle = hex(skin);
  oc.fillRect(0, 0, size, size);
  oc.drawImage(feather, 0, 0);
  return out;
}

/** A turning head with the texture on it, drawn into `canvas` until the returned stop is called. */
export function preview(canvas: HTMLCanvasElement, textureSource: HTMLCanvasElement): () => void {
  const gl = canvas.getContext('webgl', { antialias: true })!;
  if (!gl) return () => {};
  const p = program(gl,
    `attribute vec3 a_pos; attribute vec2 a_uv; uniform float u_angle; uniform float u_aspect; varying vec2 v_uv; varying float v_shade;
     void main() {
       float c = cos(u_angle), s = sin(u_angle);
       vec3 p = vec3(c * a_pos.x + s * a_pos.z, a_pos.y, -s * a_pos.x + c * a_pos.z);
       v_uv = a_uv; v_shade = 0.75 + 0.25 * clamp(p.z / 8.0, -1.0, 1.0);
       float d = 40.0 - p.z;
       gl_Position = vec4(p.x * 3.2 / d / u_aspect, (p.y + 1.0) * 3.2 / d, p.z / 100.0, 1.0);
     }`,
    `precision mediump float; uniform sampler2D u_tex; varying vec2 v_uv; varying float v_shade;
     void main() { gl_FragColor = vec4(texture2D(u_tex, v_uv).rgb * v_shade, 1.0); }`);
  gl.useProgram(p);
  const attr = (name: string, data: Float32Array, n: number) => {
    buffer(gl, data);
    const loc = gl.getAttribLocation(p, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0);
  };
  attr('a_pos', positions, 3);
  attr('a_uv', uv, 2);
  buffer(gl, triangles, gl.ELEMENT_ARRAY_BUFFER);
  texture(gl, textureSource);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.GREATER);
  gl.clearDepth(-1);
  const angle = gl.getUniformLocation(p, 'u_angle'), aspect = gl.getUniformLocation(p, 'u_aspect');
  let frame = 0, stopped = false;
  const start = performance.now();
  const draw = (t: number) => {
    if (stopped) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform1f(angle, Math.sin((t - start) / 1400) * 0.7);
    gl.uniform1f(aspect, canvas.width / canvas.height);
    gl.drawElements(gl.TRIANGLES, triangles.length, gl.UNSIGNED_SHORT, 0);
    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);
  return () => { stopped = true; cancelAnimationFrame(frame); };
}
