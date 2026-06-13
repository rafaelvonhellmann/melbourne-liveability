import type { SourceRegistryId } from "../scripts/lib/source-registry";

export function registryId<const T extends SourceRegistryId>(id: T): T {
  return id;
}
