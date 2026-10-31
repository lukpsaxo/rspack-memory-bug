# Rspack 2.3.0: modules restored from the persistent cache stop sharing loader and package.json data

On a cold build every `NormalModule` that uses the same `builtin:swc-loader`
options holds an `Arc` to one shared `SwcLoader`, and every module in the same
package shares one parsed `package.json` (`DescriptionData.json`). After a warm
build restores modules from the persistent cache, each module owns its own
deserialized copy of both.

Memory for these fields grows linearly with module count, and the warm build
retains more Rust memory than the cold build that produced the cache. This
happens with both the default persistent cache and `experiments.newCache`.

## Reproduce

Allocative snapshots need a debug or profiling binding. `@rspack-debug/core`
is not published for 2.3.0, so build one from the `v2.3.0` tag (see
"Building the profiling binding" below) and copy it over
`node_modules/@rspack/binding-linux-x64-gnu/rspack.linux-x64-gnu.node`.

```sh
yarn install
yarn gen                       # 5000 small .ts modules, MODULES=n to change
rm -rf .cache

mkdir -p profiles/cold profiles/warm
RSPACK_ALLOCATIVE_DIR=$PWD/profiles/cold yarn build   # cold, writes cache
RSPACK_ALLOCATIVE_DIR=$PWD/profiles/warm yarn build   # warm, restores cache
```

Set `NEW_CACHE=1` for both builds to use `experiments.newCache` instead.

Open `profiles/*/0-build.allocative` in https://www.speedscope.app (Left Heavy)
and search for `SwcLoader` and `DescriptionData`.

## Results (5000 modules, Linux x64)

Represented bytes from `0-build.metadata.json`:

| Modules | Cold    | Warm     |
|---------|---------|----------|
| 1000    | 13.6 MB | 25.4 MB  |
| 5000    | 48.3 MB | 107.7 MB |
| 10000   | 92.1 MB | 208.4 MB |

Under `Compilation > build_module_graph_artifact > module_graph > modules`:

| Path                                                     | Cold    | Warm    |
|----------------------------------------------------------|---------|---------|
| `NormalModule > loaders > SwcLoader`                     | ~0 MB   | 49.7 MB |
| `NormalModule > resource_data > ResourceData > resource_description` | 0.3 MB  | 2.3 MB  |

`SwcLoader` cost is about 10 KB per module (mostly
`options_with_additional.resource_specific_jsc` and `swc_options`), so it
scales with module count, not with the number of distinct loader configs.
`DescriptionData` cost scales with module count times `package.json` size.

With `NEW_CACHE=1` the same copies appear under
`Compilation > cache > CacheStorage > memory_cache > ... > ModuleRef > NormalModule > loaders > SwcLoader`.

In a real application (18.5k modules, 3 swc-loader option sets, a large
monorepo `package.json`) the warm build retains about 152 MB of `SwcLoader`
copies and 77 MB of `DescriptionData` copies that the cold build does not.
With `newCache` the memory cache keeps about 680 MB of restored modules and
code generation results on top of the module graph.

## Likely cause

- `SwcLoader` is `#[cacheable]` and `NormalModule.loaders` is serialized per
  module. On a cold build the loaders come from `SWC_LOADER_CACHE` in
  `rspack_loader_swc/src/plugin.rs`, keyed by loader request and options, so
  modules share an `Arc`. Deserialization rebuilds a fresh `SwcLoader` (and
  reparses its options) for every module instead of going through that cache.
- `DescriptionData.json` is `Arc<serde_json::Value>` serialized with
  `AsInner<AsPreset>`, so each module restores its own copy of the
  `package.json` value instead of sharing one per description file.

Interning both on deserialize (for example by loader identifier plus raw
options, and by description file path) would restore the cold-build sharing.

## Building the profiling binding

The `v2.3.0` tag needs two local fixes to build with allocative support; they
are in `allocative-build.patch`:

- `rspack_allocative_derive` emits `#[ctor::ctor]` through a re-export, which
  fails with "cannot find `ctor` in the crate root". Passing
  `crate_path = rspack_allocative::__macro_refs::ctor` (and `unsafe`, required
  by ctor 0.13) fixes it.
- `NO_PERFETTO=1` skips the `perfetto` feature for the profiling profile.

```sh
git clone --depth 1 --branch v2.3.0 https://github.com/web-infra-dev/rspack.git
cd rspack && git apply ../allocative-build.patch
pnpm install
NO_PERFETTO=1 pnpm run build:binding:profiling
```

## Environment

- Rspack 2.3.0 (`@rspack/core`, `@rspack/cli`)
- Node.js 24.18.0
- Linux x64 (WSL2), 32 cores
