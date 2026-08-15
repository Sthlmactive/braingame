"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loading } from "./NotFound";

/**
 * Sends an old URL to its replacement.
 *
 * `redirect()` from next/navigation needs a server, and this app is a static
 * export, so the hop happens on mount instead. It replaces rather than pushes:
 * a dead URL should not sit in the back stack waiting to be returned to.
 */
export function Redirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return <Loading />;
}
