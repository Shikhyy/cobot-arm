import * as THREE from "three";

/**
 * Procedural surface detail for the printed parts.
 *
 * The CAD came out of an STL, so it has no UVs and no texture maps — every
 * surface is one flat colour, and the shape disappears into the shading.
 * This module paints the detail back in, in world space, with a small patch
 * to the standard material:
 *
 *   • **Layer lines.** A 3D print is a stack of 0.2 mm slices, and the
 *     little ridges they leave are most of what you actually see on a
 *     printed part. They are banded along the world Y axis, which is the
 *     direction the machine is printed in, and they fade out on the
 *     horizontal skins the way real layer lines do.
 *   • **Grain.** A low-amplitude value noise over the whole surface, so the
 *     highlights break up instead of reading as perfect plastic.
 *   • **Cavity shading.** The valleys between the layers are darker and
 *     rougher, which is what makes the ridges read at a distance.
 *   • **Rim light.** A Fresnel edge on the silhouette, so the machine keeps
 *     its outline against a dark background.
 *
 * The perturbation is applied to the shading normal, not to the geometry, so
 * it costs nothing but a few instructions in the fragment shader.
 */

export interface SurfaceOptions {
  /** Layer height in world units (1 unit = 100 mm on this model). */
  layerHeight?: number;
  /** How far the layers displace the normal. */
  bump?: number;
  /** How much the valleys darken the surface. */
  cavity?: number;
  /** How much the surface roughness varies. */
  roughVariation?: number;
  /** Size of the grain, in world units. */
  grain?: number;
  /** Edge light strength. */
  rim?: number;
  /** Edge light colour. */
  rimColor?: THREE.ColorRepresentation;
  /** Random offset, so two parts do not look printed in the same batch. */
  phase?: number;
}

/* ------------------------------------------------------------------ */
/* the shader patch                                                    */
/* ------------------------------------------------------------------ */

const VERTEX_HEAD = /* glsl */ `
varying vec3 vSurfacePos;
varying vec3 vSurfaceNormal;
`;

const FRAGMENT_HEAD = /* glsl */ `
varying vec3 vSurfacePos;
varying vec3 vSurfaceNormal;
uniform float uLayerFreq;
uniform float uBump;
uniform float uCavity;
uniform float uRoughVariation;
uniform float uGrainFreq;
uniform float uRim;
uniform vec3 uRimColor;
uniform float uPhase;

// A cheap, smooth value noise. Three octaves of a sine lattice is enough
// to break a specular highlight up without looking like static.
float surfaceNoise(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  vec3 q = p;
  for (int i = 0; i < 3; i++) {
    v += a * sin(q.x * 1.71 + q.y * 2.37 + q.z * 1.13 + float(i) * 2.17);
    q *= 2.03;
    a *= 0.5;
  }
  return v;
}
`;

/**
 * Patch a standard material so it renders with printed-surface detail.
 *
 * The patch is deliberately conservative: it only touches the normal, the
 * roughness and the final colour, so the material keeps every feature of
 * `MeshStandardMaterial` (shadows, tone mapping, the environment map).
 */
export function applySurfaceDetail(
  material: THREE.MeshStandardMaterial,
  options: SurfaceOptions = {},
): void {
  const {
    layerHeight = 0.0022,
    bump = 0.55,
    cavity = 0.16,
    roughVariation = 0.12,
    grain = 0.9,
    rim = 0.35,
    rimColor = "#ffd9c2",
    phase = 0,
  } = options;

  const uniforms = {
    uLayerFreq: { value: 1 / Math.max(layerHeight, 1e-4) },
    uBump: { value: bump },
    uCavity: { value: cavity },
    uRoughVariation: { value: roughVariation },
    uGrainFreq: { value: 1 / Math.max(grain, 1e-4) },
    uRim: { value: rim },
    uRimColor: { value: new THREE.Color(rimColor) },
    uPhase: { value: phase },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    /* --- vertex: hand the fragment stage a world position and normal --- */
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_HEAD}`)
      .replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>
        vSurfaceNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      )
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
        vSurfacePos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    /* --- fragment: the detail itself --- */
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_HEAD}`)
      /* The layer bands, before the lighting is evaluated. */
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          /* The layers stack along world Y. On a surface that faces up or
             down they are hidden under the skin, so they fade out there. */
          float skin = 1.0 - abs(normalize(vSurfaceNormal).y);
          float ly = vSurfacePos.y + uPhase;

          /* Anti-aliasing. The bands are far finer than a pixel when the
             whole machine is in shot, and an unfiltered pattern of that
             frequency turns into a moire. Fade them out as they approach
             the pixel grid. */
          float footprint = fwidth(ly) * uLayerFreq;
          float resolved = 1.0 - smoothstep(0.2, 0.55, footprint);

          float band = sin(ly * uLayerFreq * 6.2831853) * resolved;
          float slope = cos(ly * uLayerFreq * 6.2831853)
                      * uLayerFreq * 6.2831853 * resolved;

          /* Perturb the shading normal by the tangential part of the
             height gradient. */

          float grain = surfaceNoise(vSurfacePos * uGrainFreq);
          roughnessFactor = clamp(
            roughnessFactor + band * uRoughVariation * skin + grain * 0.04,
            0.04,
            1.0
          );
          diffuseColor.rgb *= 1.0 - uCavity * (0.5 - 0.5 * band) * skin;

          /* Tilt the shading normal by a fixed angle, along the direction
             the layers climb. The angle is set in radians rather than as a
             slope, so the look does not change when the layer spacing
             does. */
          vec3 gradient = vec3(0.0, slope, 0.0);
          vec3 tangent = gradient - dot(gradient, normal) * normal;
          float steepness = length(tangent);
          if (steepness > 1e-5) {
            vec3 tiltAxis = tangent / steepness;
            float angle = uBump * skin;
            normal = normalize(normal * cos(angle) - tiltAxis * sin(angle));
          }
        }`,
      )
      /* A Fresnel edge, added to the light the surface already received. */
      .replace(
        "#include <opaque_fragment>",
        `{
          float facing = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
          outgoingLight += uRimColor * uRim * pow(facing, 4.0);
        }
        #include <opaque_fragment>`,
      );
  };

  /* The patch changes the program, so the material has to be recompiled
     rather than reused from the cache. */
  material.customProgramCacheKey = () => "surface-detail";
  material.needsUpdate = true;
}

/* ------------------------------------------------------------------ */
/* geometry                                                            */
/* ------------------------------------------------------------------ */

/**
 * Facet a geometry.
 *
 * The exporter welds the CAD's vertices and averages the normals, which
 * rounds off every chamfer, fillet and hole edge. Splitting the vertices
 * again gives every facet its own normal: the hard edges the designer drew
 * come back, and the small radii read as the band of facets a printed part
 * really has.
 */
export function facetGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const faceted = geometry.index ? geometry.toNonIndexed() : geometry;
  faceted.computeVertexNormals();
  faceted.computeBoundingSphere();
  return faceted;
}

/**
 * A small, stable offset per part, so that two printed parts on the same
 * machine do not carry the identical layer pattern.
 */
export function partPhase(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 9973;
  }
  return (hash / 9973) * 4;
}
