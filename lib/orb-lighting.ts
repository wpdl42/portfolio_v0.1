import { categories, searchPortfolio, type CategoryId, type Category } from "@/lib/orb-content"
import type { PortfolioContent } from "@/lib/cms/types"
import type { Project } from "@/lib/portfolio"

export type OrbLighting = { category: CategoryId | null; source: "interaction" | "orb" | "selection" | "search" | "default"; palette?: Category[] }
export type OrbLightValues = { color: [number, number, number]; direction: [number, number]; strength: number }

// Category hover is the reference material for both interaction paths.
export const orbHoverLight = { strength: 1, diffuse: .24, specular: .16, rim: .22, specularPower: 42 } as const

type LightColor = OrbLightValues["color"]
export function colorIntensity(color: LightColor) {
  const value = Math.max(...color)
  return { value, saturation: value ? (value - Math.min(...color)) / value : 0 }
}

// Preserve the source colors' weighted HSV value and saturation, instead of
// letting an RGB average darken/desaturate the emitted light.
export function preserveLightColor(color: LightColor, value: number, saturation: number, fallback: LightColor): LightColor {
  const min = Math.min(...color)
  const chroma = Math.max(...color) - min
  const hue = chroma > .00001 ? color.map((channel) => (channel - min) / chroma) : (() => {
    const low = Math.min(...fallback)
    const range = Math.max(...fallback) - low
    return fallback.map((channel) => range ? (channel - low) / range : 1)
  })()
  return hue.map((channel) => value * (1 - saturation + channel * saturation)) as LightColor
}

export function blendLightColors(from: LightColor, to: LightColor, amount: number): LightColor {
  const a = colorIntensity(from)
  const b = colorIntensity(to)
  const mixed = from.map((value, index) => value + (to[index] - value) * amount) as LightColor
  return preserveLightColor(mixed, a.value + (b.value - a.value) * amount, a.saturation + (b.saturation - a.saturation) * amount, from)
}

// One priority rule for both the WebGL material and its static fallback.
export function resolveOrbLighting(interaction: CategoryId | null, selected: CategoryId | null, query: string, catalog?: Project[], content?: PortfolioContent): OrbLighting {
  const palette = content?.categories
  if (interaction) return { category: interaction, source: "interaction", palette }
  if (selected) return { category: selected, source: "selection", palette }
  const match = searchPortfolio(query, catalog, content)[0]
  return match ? { category: match.category, source: "search", palette } : { category: null, source: "default", palette }
}

export function categoryLight(lighting: OrbLighting): OrbLightValues {
  const color = (lighting.palette ?? categories).find((category) => category.id === lighting.category)?.color ?? "#ffffff"
  return {
    color: [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255) as [number, number, number],
    direction: [0, 0],
    strength: lighting.source === "interaction" ? orbHoverLight.strength : lighting.source === "selection" ? .7 : lighting.source === "search" ? .5 : 0,
  }
}

export function resolveOrbLightSource(base: OrbLighting, pointerNearby: boolean): OrbLighting["source"] {
  return base.source === "interaction" ? "interaction" : pointerNearby ? "orb" : base.source
}
