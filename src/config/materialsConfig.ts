/** Shared PBR material definitions — the whole building uses five materials. */

export interface MaterialSpec {
  color: string
  roughness: number
  metalness: number
  opacity?: number
  transparent?: boolean
  /**
   * How strongly this surface picks up the procedural environment map.
   *
   * The scene's only reflection source is the equirect built by
   * `EnvironmentLight`, and three defaults every material to 1. Concrete
   * reflecting the sky as hard as brushed steel does is most of why the tower
   * read as flat: under a single sun, the difference between two materials is
   * carried far more by how much environment each gathers than by its colour.
   */
  envMapIntensity?: number
}

export const materialsConfig = Object.freeze({
  /**
   * Warm light-grey architectural concrete (data pillars, decks).
   *
   * Hue is deliberately unchanged. This tower's identity is warm concrete; a
   * dark version of it has been rejected before, and charcoal belongs only on
   * the secondary steel elements.
   */
  structure: {
    color: '#b8b2a7',
    roughness: 0.78,
    metalness: 0.05,
    envMapIntensity: 0.5,
  } satisfies MaterialSpec,
  /** Slightly darker concrete plate; fascia rendered in graphite. */
  slab: {
    color: '#9c968c',
    roughness: 0.78,
    metalness: 0.05,
    envMapIntensity: 0.5,
  } satisfies MaterialSpec,
  fascia: {
    color: '#3a3d42',
    roughness: 0.45,
    metalness: 0.35,
    envMapIntensity: 1.2,
  } satisfies MaterialSpec,
  /**
   * Smoked blue-grey glazing, recessed behind the structural frame.
   *
   * Solid, not translucent. It reads as glass through reflection rather than
   * through see-through: low roughness and a high environment intensity, so
   * the panes pick up the sky and the district instead of the interior.
   *
   * The consequence is deliberate and worth knowing — the rear column of the
   * triangle is now hidden behind a pane from any single viewpoint, so two of
   * the three ratings are readable at a time and the third needs an orbit. The
   * tilt of the plate above still carries all three at once.
   */
  glass: {
    color: '#2a3542',
    roughness: 0.07,
    metalness: 0.9,
    envMapIntensity: 2.2,
  } satisfies MaterialSpec,
  /** Dark anodized steel — non-data supports and leave bands. */
  support: {
    color: '#26282c',
    roughness: 0.4,
    metalness: 0.8,
    envMapIntensity: 1.5,
  } satisfies MaterialSpec,

  /** Weathered white deck paint, used only for the rooftop helipad marking. */
  helipad: {
    color: '#dcd8cf',
    roughness: 0.85,
    metalness: 0,
  } satisfies MaterialSpec,

  /**
   * What the tower emits after dark: warm on the concrete, warmer still on the
   * glazing. Only ever scaled by the hour — at the daylight keys both sit at
   * exactly zero, which a test pins.
   */
  heroNightGlow: '#ffd7a4',
  heroGlassGlow: '#ffcf95',

  /** Restrained amber accent, used only as the pillar hover/selection emissive. */
  accentEmissive: '#c98a3d',
  hoverEmissiveIntensity: 0.35,
  selectedEmissiveIntensity: 0.6,

  /**
   * Warm interior light, for the storey under the cursor.
   *
   * Hovering a floor used to wash it in the amber accent above, which said
   * "this thing is selected" in the vocabulary of a UI rather than of a
   * building. Lighting the storey says the same thing in the building's own
   * terms: one floor's lights come on and every other floor stays dark, which
   * is exactly what a single occupied floor looks like from outside at dusk.
   *
   * A lamp colour, not a highlight colour — slightly warm of white, because
   * office lighting seen through glass always is.
   */
  litInterior: '#ffd9a8',
  hoverLitIntensity: 1.1,
  selectedLitIntensity: 1.9,

  /**
   * Subtle per-meal identity tint for the data pillars.
   *
   * These are absolute target colours, not multipliers: the scene layer divides
   * them by `structure.color` before writing them to `instanceColor`, so this
   * material's own hue stays the single source of the concrete tone and these
   * only nudge it. Declared long before anything read them — live as of the
   * material pass.
   */
  mealTint: Object.freeze({
    Breakfast: '#bdb5a8',
    Lunch: '#b8b2a9',
    Dinner: '#b2afa8',
  }),

  /**
   * Procedural concrete on the hero's floor plates, plus the baked shading
   * that stands in for ambient occlusion.
   *
   * There is no postprocessing in this app and there will not be: the renderer
   * runs on demand with a frozen shadow map, which an SSAO pass would fight.
   * Depth under the plates is instead painted into the geometry's own vertex
   * colours, which costs nothing per frame and cannot go out of sync.
   */
  heroConcrete: Object.freeze({
    textureSize: 256,
    /** World units covered by one tile; UVs are emitted in tile counts. */
    tileWorldSize: 8,
    /** Underside tone. The soffit never sees the sun, so it never reads at 1. */
    soffitShade: 0.8,
    /** The slab edge: shaded, but far less than the face that looks at the ground. */
    edgeShade: 0.9,
    seed: 'hero-concrete-01',
  }),

  ground: { color: '#8e8b85', roughness: 0.95, metalness: 0 } satisfies MaterialSpec,
})

export type MaterialsConfig = typeof materialsConfig
