import { useEffect, useState } from "react";
import type { ItemIcon } from "./config";

let request: Promise<Record<string, string>> | null = null;

/** Ícone de cada item da loja pelo nome (vem de /api/items; pedido uma vez por página). */
export function useItemIcons(): Record<string, string> {
  const [icons, setIcons] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    request ??= fetch("/api/items")
      .then((r) => (r.ok ? (r.json() as Promise<ItemIcon[]>) : []))
      .then((list) => Object.fromEntries(list.map((i) => [i.name, i.image])))
      .catch(() => { request = null; return {}; });
    void request.then((m) => { if (live) setIcons(m); });
    return () => { live = false; };
  }, []);
  return icons;
}
