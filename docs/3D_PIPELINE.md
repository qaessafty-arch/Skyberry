# 3D pipeline

## Current state (verified)
- Pets are built in code: `src/modules/pets/Pet3D.tsx` composes spheres, cones and capsules per species, with a hierarchical rig (groups) driven by mood and personality. There are no GLB files and no skeletal animation.
- Background: `src/modules/ocean/OceanBackground.tsx` draws animated waves, bubbles and light rays with `three`. Quality is governed by `backgroundMode` (off / lite / full) and a frame-rate governor.
- Pet homes: gradients only (`HOME_BG`). No 3D environment.

## Target pipeline (not yet run)
Research → licence check → Blender refinement → materials (PBR, from ambientCG/Poly Haven) → lighting → animation → GLB export → `gltf-transform optimize --compress meshopt` (Draco where geometry is large) → KTX2 for textures → React Three Fiber integration → browser test.

## Blockers in this environment
- Blender cannot be installed here.
- Poly Haven, ambientCG, Sketchfab and Kenney are unreachable from the sandbox.
- Therefore no asset has passed through this pipeline.

## Tooling check
`@gltf-transform` 4.5 and `meshoptimizer` 1.3 were installed in a scratch directory. A test triangle exported and optimised with `--compress meshopt`. A one-triangle file is dominated by container overhead, so it says nothing about real savings.
