import { colorIntensity, preserveLightColor } from "@/lib/orb-lighting"

export type Vec3 = [number, number, number]
export type OrbPointerInput = { clientX: number; clientY: number; updatedAt: number; eligible: boolean }
export type OrbSurfaceResponse = { point: Vec3; lightPoint: Vec3; color: Vec3; motion: number; glow: number; speed: number; motionScale: number }

export const idleSurface = (): OrbSurfaceResponse => ({ point: [0, 0, 1], lightPoint: [0, 0, 1], color: [1, 1, 1], motion: 0, glow: 0, speed: 0, motionScale: 1 })

// Perspective silhouette of the unit sphere at z=3.4, with a 36-degree field of view.
const screenRadius = 1 / Math.tan(18 * Math.PI / 180) / Math.sqrt(3.4 ** 2 - 1)
export function pointerProximity(clientX: number, clientY: number, bounds: DOMRect) {
  const radius = bounds.width * .5 * screenRadius
  const x = clientX - (bounds.left + bounds.width / 2)
  const y = bounds.top + bounds.height / 2 - clientY
  const distance = Math.hypot(x, y)
  // Full hover energy through the inner halo; fade only its final .25 radius.
  const outside = Math.min(1, Math.max(0, (distance / Math.max(1, radius) - 1.45) / .25))
  return { radius, x, y, distance, strength: 1 - outside * outside * (3 - 2 * outside) }
}

// A smooth radial projection keeps the light just inside the visible silhouette.
// The same projection is used on BOTH sides of the edge; only direct contact
// uses the raw intersection for the existing physical deformation.
export function proximitySurfacePoint(clientX: number, clientY: number, bounds: DOMRect, time: number, tiltX: number, tiltY: number, response: OrbSurfaceResponse): Vec3 | null {
  const proximity = pointerProximity(clientX, clientY, bounds)
  const normalized = proximity.distance / Math.max(1, proximity.radius)
  const projected = normalized <= .8 ? normalized : .8 + .13 * (1 - Math.exp(-(normalized - .8) / .13))
  const scale = normalized ? projected / normalized : 1
  return intersectOrbSurface(bounds.left + bounds.width / 2 + proximity.x * scale, bounds.top + bounds.height / 2 - proximity.y * scale, bounds, time, tiltX, tiltY, response)
}

// Keep this radius function in sync with surface() in the vertex shader.
function radius(p: Vec3, time: number, response: OrbSurfaceResponse) {
  const wave = Math.sin(p[0] * 2.4 + p[1] * 1.7 + p[2] * 1.3 + time * .27)
    + .48 * Math.sin(p[0] * -3.1 + p[1] * 2.8 + p[2] * 1.9 - time * .19)
    + .24 * Math.sin(p[0] * 4.3 + p[1] * -2.7 + p[2] * 3.1 + time * .16)
  const dot = p.reduce((sum, value, index) => sum + value * response.point[index], 0)
  const pull = Math.exp(-Math.max(0, 1 - dot) * 20) * response.motion * (.014 + .022 * response.speed)
  return 1 + wave * .012 * response.motionScale + pull
}

// A perspective ray is transformed back into mesh space, then intersected with
// the same radial surface used by WebGL (including the current local pull).
export function intersectOrbSurface(clientX: number, clientY: number, bounds: DOMRect, time: number, tiltX: number, tiltY: number, response: OrbSurfaceResponse): Vec3 | null {
  if (!bounds.width || !bounds.height) return null
  const ax = tiltY * .075 + Math.sin(time * .07) * .025 * response.motionScale
  const ay = tiltX * .075 + Math.sin(time * .055) * .04 * response.motionScale
  const inverse = ([x, y, z]: Vec3): Vec3 => {
    const rx = Math.cos(ay) * x - Math.sin(ay) * z
    const rz = Math.sin(ay) * x + Math.cos(ay) * z
    return [rx, Math.cos(ax) * y - Math.sin(ax) * rz, Math.sin(ax) * y + Math.cos(ax) * rz]
  }
  const tangent = Math.tan(18 * Math.PI / 180)
  const direction = inverse([((clientX - bounds.left) / bounds.width * 2 - 1) * tangent, (1 - (clientY - bounds.top) / bounds.height * 2) * tangent, -1])
  const length = Math.hypot(...direction)
  const ray = direction.map((value) => value / length) as Vec3
  const origin = inverse([-tiltX * .025, -tiltY * .025, 3.4])
  const b = origin.reduce((sum, value, index) => sum + value * ray[index], 0)
  const discriminant = b * b - (origin.reduce((sum, value) => sum + value * value, 0) - 1.08 ** 2)
  if (discriminant < 0) return null
  const start = -b - Math.sqrt(discriminant)
  const end = -b + Math.sqrt(discriminant)
  const pointAt = (distance: number) => origin.map((value, index) => value + ray[index] * distance) as Vec3
  const signedDistance = (distance: number) => {
    const point = pointAt(distance)
    const size = Math.hypot(...point)
    return size - radius(point.map((value) => value / size) as Vec3, time, response)
  }
  let previous = start
  for (let step = 1; step <= 32; step++) {
    const distance = start + (end - start) * step / 32
    if (signedDistance(distance) <= 0) {
      let near = previous
      let far = distance
      for (let iteration = 0; iteration < 13; iteration++) {
        const middle = (near + far) / 2
        if (signedDistance(middle) > 0) near = middle
        else far = middle
      }
      const point = pointAt((near + far) / 2)
      const size = Math.hypot(...point)
      return point.map((value) => value / size) as Vec3
    }
    previous = distance
  }
  return null
}

export type CategoryPosition = { x: number; y: number; color: Vec3 }

// Softened inverse-cube screen distances: no winner-takes-all switch, including
// when the pointer is exactly at a category's center.
export function proximityColor(x: number, y: number, positions: CategoryPosition[], radius: number): Vec3 {
  let total = 0
  let brightness = 0
  let saturation = 0
  let largestWeight = 0
  let fallback: Vec3 = [1, 1, 1]
  const color: Vec3 = [0, 0, 0]
  for (const position of positions) {
    const distance = ((x - position.x) ** 2 + (y - position.y) ** 2) / Math.max(1, radius ** 2)
    const weight = 1 / (.35 ** 2 + distance) ** 1.5
    total += weight
    const intensity = colorIntensity(position.color)
    brightness += intensity.value * weight
    saturation += intensity.saturation * weight
    if (weight > largestWeight) { largestWeight = weight; fallback = position.color }
    color.forEach((_, index) => { color[index] += position.color[index] * weight })
  }
  return total ? preserveLightColor(color.map((value) => value / total) as Vec3, brightness / total, saturation / total, fallback) : [1, 1, 1]
}
