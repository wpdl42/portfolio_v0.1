import { orbHoverLight, type OrbLightValues } from "@/lib/orb-lighting"
import type { OrbSurfaceResponse } from "@/lib/orb-surface"

// Indexed sphere with a gently displaced surface and normals derived from that surface.
// The existing pearl artwork is reused as a matcap, combined with dynamic lighting.
const vertexSource = `
precision highp float;
attribute vec3 aPosition;
uniform mat4 uProjection;
uniform mediump float uTime;
uniform vec2 uPointer;
uniform mediump vec3 uHoverPoint;
uniform float uHoverMotion;
uniform float uHoverSpeed;
uniform float uMotionScale;
varying mediump vec3 vNormal;
varying mediump vec3 vPosition;
varying mediump vec3 vSurface;

vec3 surface(vec3 p) {
  float wave = sin(dot(p, vec3(2.4, 1.7, 1.3)) + uTime * .27);
  wave += .48 * sin(dot(p, vec3(-3.1, 2.8, 1.9)) - uTime * .19);
  wave += .24 * sin(dot(p, vec3(4.3, -2.7, 3.1)) + uTime * .16);
  float pull = exp(-max(0., 1. - dot(p, uHoverPoint)) * 20.) * uHoverMotion * (.014 + .022 * uHoverSpeed);
  return p * (1.0 + wave * .012 * uMotionScale + pull);
}
vec3 rotateSurface(vec3 p) {
  float ax = uPointer.y * .075 + sin(uTime * .07) * .025 * uMotionScale;
  float ay = uPointer.x * .075 + sin(uTime * .055) * .04 * uMotionScale;
  p.yz = mat2(cos(ax), -sin(ax), sin(ax), cos(ax)) * p.yz;
  p.xz = mat2(cos(ay), -sin(ay), sin(ay), cos(ay)) * p.xz;
  return p;
}
void main() {
  vec3 p = normalize(aPosition);
  vec3 tangent = normalize(cross(abs(p.y) < .98 ? vec3(0.,1.,0.) : vec3(1.,0.,0.), p));
  vec3 bitangent = cross(p, tangent);
  vec3 displaced = surface(p);
  vec3 dt = surface(normalize(p + tangent * .003)) - displaced;
  vec3 db = surface(normalize(p + bitangent * .003)) - displaced;
  vNormal = rotateSurface(normalize(cross(dt, db)));
  vSurface = p;
  vPosition = rotateSurface(displaced) + vec3(uPointer * .025, 0.);
  gl_Position = uProjection * vec4(vPosition - vec3(0.,0.,3.4), 1.);
}`

const fragmentSource = `
precision mediump float;
uniform sampler2D uMatcap;
uniform mediump float uTime;
uniform vec3 uCategoryColor;
uniform vec2 uCategoryDirection;
uniform float uCategoryStrength;
uniform vec3 uGlowPoint;
uniform vec3 uGlowColor;
uniform float uHoverGlow;
varying mediump vec3 vNormal;
varying mediump vec3 vPosition;
varying mediump vec3 vSurface;
float lightResponse(vec2 direction, vec3 normal, vec3 view, float fresnel) {
  vec3 light = normalize(vec3(direction * 1.5, .85));
  float diffuse = pow(max(dot(normal, light), 0.), 1.5);
  float specular = pow(max(dot(normal, normalize(light + view)), 0.), ${orbHoverLight.specularPower.toFixed(1)});
  float rim = fresnel * max(dot(normal.xy, direction), 0.);
  return diffuse * ${orbHoverLight.diffuse.toFixed(3)} + specular * ${orbHoverLight.specular.toFixed(3)} + rim * ${orbHoverLight.rim.toFixed(3)};
}
void main() {
  vec3 n = normalize(vNormal);
  vec3 view = normalize(vec3(0.,0.,3.4) - vPosition);
  float facing = max(dot(n, view), 0.);
  float fresnel = pow(1. - facing, 2.6);
  vec2 uv = .5 + n.xy * .445;
  uv += vec2(sin(n.y * 4. + uTime * .12), cos(n.x * 3. - uTime * .1)) * .009;
  vec3 pearl = texture2D(uMatcap, uv).rgb;
  vec3 coolLight = normalize(vec3(-.7, .9, 1.4));
  vec3 warmLight = normalize(vec3(1., -.25, 1.1));
  float coolSpec = pow(max(dot(n, normalize(coolLight + view)), 0.), 100.);
  float warmSpec = pow(max(dot(n, normalize(warmLight + view)), 0.), 75.);
  float film = .5 + .5 * sin(n.y * 5. + n.x * 3. + uTime * .13);
  vec3 rim = mix(vec3(.66,.80,1.), vec3(1.,.83,.73), film);
  vec3 color = pearl * (.94 + .06 * max(dot(n,coolLight),0.));
  color = mix(color, rim, fresnel * .46);
  color += vec3(.84,.92,1.) * coolSpec * .34 + vec3(1.,.87,.77) * warmSpec * .22;
  color += rim * fresnel * .18;
  // Light the displaced normals; retain the pearl texture rather than tinting it flat.
  float categoryResponse = lightResponse(uCategoryDirection, n, view, fresnel);
  vec2 glowDirection = uGlowPoint.xy / max(length(uGlowPoint.xy), .001);
  float distanceSquared = dot(vSurface - uGlowPoint, vSurface - uGlowPoint);
  // A full-strength core retains the reference highlights; only its edge softens.
  float contact = 1. - smoothstep(.12, .8, distanceSquared);
  float proximityResponse = lightResponse(glowDirection, n, view, fresnel) * contact;
  float categoryWeight = uCategoryStrength * (1. - uHoverGlow);
  float proximityWeight = ${orbHoverLight.strength.toFixed(3)} * uHoverGlow;
  // Normalize the crossfade once so two easing envelopes cannot create a dip.
  float energy = min(${orbHoverLight.strength.toFixed(3)}, uCategoryStrength + proximityWeight);
  float gain = energy / max(categoryWeight + proximityWeight, .0001);
  vec3 lighting = (uCategoryColor * categoryResponse * categoryWeight + uGlowColor * proximityResponse * proximityWeight) * gain;
  color += lighting * (1. - color * .55);
  gl_FragColor = vec4(clamp(color,0.,1.), 1.);
}`

function sphereMesh(rows: number, columns: number) {
  const positions: number[] = []
  const indices: number[] = []
  for (let row = 0; row <= rows; row++) {
    const theta = row / rows * Math.PI
    for (let column = 0; column <= columns; column++) {
      const phi = column / columns * Math.PI * 2
      positions.push(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi))
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column
      const b = a + columns + 1
      indices.push(a, a + 1, b, b, a + 1, b + 1)
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint16Array(indices) }
}

export function createFluidRenderer(canvas: HTMLCanvasElement, compact: boolean, onFailure: (reason: string) => void) {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true, powerPreference: "low-power", preserveDrawingBuffer: false })
  if (!gl) { onFailure("WebGL unavailable"); return null }
  const shaders: WebGLShader[] = []
  const buffers: WebGLBuffer[] = []
  let program: WebGLProgram | null = null
  let texture: WebGLTexture | null = null
  try {
    function shader(type: number, source: string) {
      const result = gl!.createShader(type)
      if (!result) throw new Error("Cannot create Orb shader")
      shaders.push(result)
      gl!.shaderSource(result, source)
      gl!.compileShader(result)
      if (!gl!.getShaderParameter(result, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(result) ?? "Orb shader compilation failed")
      return result
    }
    program = gl.createProgram()
    if (!program) throw new Error("Cannot create Orb program")
    gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource))
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "Cannot link Orb shaders")
    gl.useProgram(program)
    const mesh = sphereMesh(compact ? 32 : 48, compact ? 48 : 72)
    const positionBuffer = gl.createBuffer()
    const indexBuffer = gl.createBuffer()
    if (!positionBuffer || !indexBuffer) throw new Error("Cannot create Orb mesh")
    buffers.push(positionBuffer, indexBuffer)
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, "aPosition")
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW)
    const projection = gl.getUniformLocation(program, "uProjection")
    const timeUniform = gl.getUniformLocation(program, "uTime")
    const pointerUniform = gl.getUniformLocation(program, "uPointer")
    const colorUniform = gl.getUniformLocation(program, "uCategoryColor")
    const directionUniform = gl.getUniformLocation(program, "uCategoryDirection")
    const strengthUniform = gl.getUniformLocation(program, "uCategoryStrength")
    const hoverPointUniform = gl.getUniformLocation(program, "uHoverPoint")
    const glowPointUniform = gl.getUniformLocation(program, "uGlowPoint")
    const glowColorUniform = gl.getUniformLocation(program, "uGlowColor")
    const hoverMotionUniform = gl.getUniformLocation(program, "uHoverMotion")
    const hoverGlowUniform = gl.getUniformLocation(program, "uHoverGlow")
    const hoverSpeedUniform = gl.getUniformLocation(program, "uHoverSpeed")
    const motionScaleUniform = gl.getUniformLocation(program, "uMotionScale")
    texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([148, 163, 199, 255]))
    gl.uniform1i(gl.getUniformLocation(program, "uMatcap"), 0)
    gl.enable(gl.DEPTH_TEST)
    const f = 1 / Math.tan(36 * Math.PI / 360)
    gl.uniformMatrix4fv(projection, false, new Float32Array([f,0,0,0, 0,f,0,0, 0,0,-10.1/9.9,-1, 0,0,-2/9.9,0]))

    return {
      loadImage(image: HTMLImageElement) {
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
      },
      draw(time: number, x: number, y: number, light: OrbLightValues, surface: OrbSurfaceResponse) {
        const pixelRatio = Math.min(devicePixelRatio || 1, compact ? 1.25 : 1.5)
        const dimension = Math.max(1, Math.min(900, Math.round(canvas.clientWidth * pixelRatio)))
        if (canvas.width !== dimension || canvas.height !== dimension) { canvas.width = dimension; canvas.height = dimension }
        gl.viewport(0, 0, dimension, dimension)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
        gl.uniform1f(timeUniform, time)
        gl.uniform2f(pointerUniform, x, y)
        gl.uniform3f(colorUniform, ...light.color)
        gl.uniform2f(directionUniform, ...light.direction)
        gl.uniform1f(strengthUniform, light.strength)
        gl.uniform3f(hoverPointUniform, ...surface.point)
        gl.uniform3f(glowPointUniform, ...surface.lightPoint)
        gl.uniform3f(glowColorUniform, ...surface.color)
        gl.uniform1f(hoverMotionUniform, surface.motion)
        gl.uniform1f(hoverGlowUniform, surface.glow)
        gl.uniform1f(hoverSpeedUniform, surface.speed)
        gl.uniform1f(motionScaleUniform, surface.motionScale)
        gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0)
      },
      dispose() {
        buffers.forEach((buffer) => gl.deleteBuffer(buffer))
        shaders.forEach((item) => gl.deleteShader(item))
        gl.deleteTexture(texture)
        gl.deleteProgram(program)
      },
    }
  } catch (error) {
    onFailure(error instanceof Error ? error.message : "WebGL setup failed")
    buffers.forEach((buffer) => gl.deleteBuffer(buffer))
    shaders.forEach((item) => gl.deleteShader(item))
    gl.deleteTexture(texture)
    gl.deleteProgram(program)
    return null
  }
}
